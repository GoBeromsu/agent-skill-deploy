import { requestUrl } from 'obsidian';
import type { PluginLogger } from '../shared/plugin-logger';
import { createSnapshotHash } from '../domain/blob-sha';
import type { MirrorCommitFile, RemoteBlobEntry, RemoteManagedTree } from '../types/skill';
import { normalizeRepoPath } from '../domain/mirror-plan';

export interface AtomicCommitResult {
	commitSha: string;
	rootTreeSha: string;
}

export class DeployConflictError extends Error {
	constructor(message: string, public readonly orphanedCommitSha?: string) {
		super(message);
		this.name = 'DeployConflictError';
	}
}

export class GitHubApiClient {
	private readonly baseUrl = 'https://api.github.com';

	constructor(private readonly logger: PluginLogger) {}

	async getUser(token: string): Promise<string> {
		const resp = await this.request('GET', '/user', token);
		this.logRateLimit(resp.headers);
		const data = JSON.parse(resp.text) as { login: string };
		return data.login;
	}

	async getRef(owner: string, repo: string, branch: string, token: string): Promise<{ sha: string; treeSha: string }> {
		const resp = await this.request('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
		this.logRateLimit(resp.headers);
		const data = JSON.parse(resp.text) as { object: { sha: string } };
		const commitSha = data.object.sha;

		const commitResp = await this.request('GET', `/repos/${owner}/${repo}/git/commits/${commitSha}`, token);
		this.logRateLimit(commitResp.headers);
		const commitData = JSON.parse(commitResp.text) as { tree: { sha: string } };

		return { sha: commitSha, treeSha: commitData.tree.sha };
	}

	async getManagedTree(
		owner: string,
		repo: string,
		branch: string,
		managedPaths: readonly string[],
		token: string,
	): Promise<RemoteManagedTree> {
		const ref = await this.getRef(owner, repo, branch, token);
		const tree = await this.getTree(owner, repo, ref.treeSha, token, true);
		const normalizedManagedPaths = [...new Set(
			managedPaths
				.map(path => normalizeRepoPath(path))
				.filter(path => path !== ''),
		)];
		const files: RemoteBlobEntry[] = tree
			.filter(entry => entry.type === 'blob')
			.filter(entry => normalizedManagedPaths.some(path => matchesManagedPath(entry.path, path)))
			.map(entry => ({
				path: entry.path,
				sha: entry.sha,
			}))
			.sort((left, right) => left.path.localeCompare(right.path));

		return {
			rootTreeSha: ref.treeSha,
			managedTreeSha: createSnapshotHash(files.map(file => ({
				relativePath: file.path,
				blobSha: file.sha,
			}))),
			files,
		};
	}

	async createAtomicCommit(
		owner: string,
		repo: string,
		branch: string,
		filesToUpsert: readonly MirrorCommitFile[],
		filesToDelete: readonly string[],
		message: string,
		token: string,
	): Promise<AtomicCommitResult> {
		const ref = await this.getRef(owner, repo, branch, token);
		const parentCommitSha = ref.sha;
		const baseTreeSha = ref.treeSha;

		const blobShas: Array<{ path: string; sha: string }> = [];
		for (const file of filesToUpsert) {
			const blobResp = await this.request('POST', `/repos/${owner}/${repo}/git/blobs`, token, {
				content: file.content,
				encoding: file.encoding,
			});
			this.logRateLimit(blobResp.headers);
			const blobData = JSON.parse(blobResp.text) as { sha: string };
			blobShas.push({ path: file.path, sha: blobData.sha });
		}

		const treeResp = await this.request('POST', `/repos/${owner}/${repo}/git/trees`, token, {
			base_tree: baseTreeSha,
			tree: [
				...blobShas.map(blob => ({
					path: blob.path,
					mode: '100644',
					type: 'blob',
					sha: blob.sha,
				})),
				...filesToDelete.map(path => ({
					path,
					mode: '100644',
					type: 'blob',
					sha: null,
				})),
			],
		});
		this.logRateLimit(treeResp.headers);
		const treeData = JSON.parse(treeResp.text) as { sha: string };
		const newTreeSha = treeData.sha;

		const commitResp = await this.request('POST', `/repos/${owner}/${repo}/git/commits`, token, {
			message,
			tree: newTreeSha,
			parents: [parentCommitSha],
		});
		this.logRateLimit(commitResp.headers);
		const commitData = JSON.parse(commitResp.text) as { sha: string };
		const newCommitSha = commitData.sha;

		try {
			const refResp = await this.request('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
				sha: newCommitSha,
			});
			this.logRateLimit(refResp.headers);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('422') || message.includes('fast-forward')) {
				throw new DeployConflictError(
					`Conflict: branch was updated during deploy. Orphaned commit: ${newCommitSha}`,
					newCommitSha,
				);
			}
			throw err;
		}

		return { commitSha: newCommitSha, rootTreeSha: newTreeSha };
	}

	private async getTree(
		owner: string,
		repo: string,
		treeSha: string,
		token: string,
		recursive: boolean,
	): Promise<Array<{ path: string; sha: string; type: 'blob' | 'tree' | 'commit' }>> {
		const suffix = recursive ? '?recursive=1' : '';
		const resp = await this.request('GET', `/repos/${owner}/${repo}/git/trees/${treeSha}${suffix}`, token);
		this.logRateLimit(resp.headers);
		const data = JSON.parse(resp.text) as {
			tree: Array<{ path: string; sha: string; type: 'blob' | 'tree' | 'commit' }>;
		};
		return data.tree;
	}

	private async request(
		method: string,
		path: string,
		token: string,
		body?: unknown,
	): Promise<{ text: string; headers: Record<string, string>; status: number }> {
		const resp = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method,
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		if (resp.status >= 400) {
			throw new Error(`GitHub API ${method} ${path} failed with ${resp.status}: ${resp.text}`);
		}

		return { text: resp.text, headers: resp.headers, status: resp.status };
	}

	private logRateLimit(headers: Record<string, string>): void {
		const remaining = headers['x-ratelimit-remaining'];
		if (remaining) {
			this.logger.info('GitHub API rate limit', { remaining });
		}
	}
}

function matchesManagedPath(targetPath: string, managedPath: string): boolean {
	return targetPath === managedPath || targetPath.startsWith(`${managedPath}/`);
}
