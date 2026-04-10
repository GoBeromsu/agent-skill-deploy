import { createGitBlobSha } from './blob-sha';
import { normalizeRepoPath } from './mirror-plan';
import type { DeployableFolder, PackagedFile, PackagingResult } from '../types/skill';
import type { SkillDeploySettings } from '../types/settings';
import type { VaultAdapter } from '../ui/vault-adapter';

export async function buildPackagingResult(
	settings: SkillDeploySettings,
	localFolders: readonly DeployableFolder[],
	vaultAdapter: VaultAdapter,
): Promise<PackagingResult> {
	return settings.targetProvider === 'codex-plugin'
		? buildCodexPackaging(settings, localFolders)
		: buildClaudePackaging(settings, localFolders, vaultAdapter);
}

async function buildClaudePackaging(
	settings: SkillDeploySettings,
	localFolders: readonly DeployableFolder[],
	vaultAdapter: VaultAdapter,
): Promise<PackagingResult> {
	const managedSkillsPath = normalizeRepoPath(settings.managedSkillsPath || 'skills');
	const files: PackagedFile[] = [];

	for (const folder of localFolders) {
		const publishPath = getPublishedFolderPath(managedSkillsPath, folder);
		for (const file of folder.files) {
			files.push({
				path: normalizeRepoPath(publishPath, file.relativePath),
				content: file.content,
				encoding: file.encoding,
				blobSha: file.blobSha,
				groupName: folder.folderName,
			});
		}
	}

	const warnings: string[] = [];
	const marketplacePath = normalizeRepoPath(settings.sourceRootPath, '.claude-plugin', 'marketplace.json');
	const marketplaceFile = await vaultAdapter.readVaultFileByPath(marketplacePath);
	if (marketplaceFile) {
		const rewritten = rewriteClaudeMarketplace(
			marketplaceFile.content,
			managedSkillsPath,
			new Map(localFolders.map(folder => [folder.folderName, getPublishedFolderPath(managedSkillsPath, folder)])),
		);
		files.push({
			path: '.claude-plugin/marketplace.json',
			content: rewritten.content,
			encoding: 'utf-8',
			blobSha: rewritten.blobSha,
			groupName: '.claude-plugin',
		});
		warnings.push(...rewritten.warnings);
	}

	return {
		managedSkillsPath,
		files: files.sort((left, right) => left.path.localeCompare(right.path)),
		warnings,
	};
}

function buildCodexPackaging(
	settings: SkillDeploySettings,
	localFolders: readonly DeployableFolder[],
): PackagingResult {
	const pluginRoot = normalizeRepoPath(settings.codexPluginPath || 'plugins/ataraxia-skills');
	const managedSkillsPath = normalizeRepoPath(pluginRoot, 'skills');
	const pluginName = settings.codexPluginName.trim() || 'ataraxia-skills';
	const files: PackagedFile[] = [];

	for (const folder of localFolders) {
		const publishPath = getPublishedFolderPath(managedSkillsPath, folder);
		for (const file of folder.files) {
			files.push({
				path: normalizeRepoPath(publishPath, file.relativePath),
				content: file.content,
				encoding: file.encoding,
				blobSha: file.blobSha,
				groupName: folder.folderName,
			});
		}
	}

	const pluginManifest = JSON.stringify({
		name: pluginName,
		version: '0.1.0',
		description: 'Packaged Ataraxia skills for Codex',
		skills: './skills/',
		interface: {
			displayName: 'Ataraxia Skills',
			shortDescription: 'Reusable skills from the Ataraxia vault',
			category: 'Productivity',
		},
	}, null, 2) + '\n';

	files.push({
		path: normalizeRepoPath(pluginRoot, '.codex-plugin', 'plugin.json'),
		content: pluginManifest,
		encoding: 'utf-8',
		blobSha: createGitBlobSha(Buffer.from(pluginManifest, 'utf-8')),
		groupName: '.codex-plugin',
	});

	return {
		managedSkillsPath,
		files: files.sort((left, right) => left.path.localeCompare(right.path)),
		warnings: [],
	};
}

function getPublishedFolderPath(managedSkillsPath: string, folder: DeployableFolder): string {
	return folder.publishGroup
		? normalizeRepoPath(managedSkillsPath, folder.publishGroup, folder.folderName)
		: normalizeRepoPath(managedSkillsPath, folder.folderName);
}

function rewriteClaudeMarketplace(
	content: string,
	managedSkillsPath: string,
	localFolderPaths: ReadonlyMap<string, string>,
): { content: string; blobSha: string; warnings: string[] } {
	const warnings: string[] = [];

	try {
		const parsed = JSON.parse(content) as {
			plugins?: Array<{ skills?: unknown } & Record<string, unknown>>;
		} & Record<string, unknown>;
		const normalizedSkillsBase = `./${normalizeRepoPath(managedSkillsPath)}`;

		if (Array.isArray(parsed.plugins)) {
			for (const plugin of parsed.plugins) {
				if (!Array.isArray(plugin.skills)) continue;
				const skillEntries = plugin.skills as unknown[];
				plugin.skills = skillEntries.map((value: unknown) => {
					if (typeof value !== 'string') return value;
					const folderName = value.replace(/^\.\/+/, '').split('/').filter(Boolean).pop();
					if (!folderName) return value;
					const publishedPath = localFolderPaths.get(folderName);
					if (!publishedPath) return value;
					const relativeManagedPath = publishedPath.startsWith(`${managedSkillsPath}/`)
						? publishedPath.slice(managedSkillsPath.length + 1)
						: folderName;
					return `${normalizedSkillsBase}/${relativeManagedPath}`;
				});
			}
		}

		const rewritten = JSON.stringify(parsed, null, 2) + '\n';
		return {
			content: rewritten,
			blobSha: createGitBlobSha(Buffer.from(rewritten, 'utf-8')),
			warnings,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		warnings.push(`Failed to rewrite .claude-plugin/marketplace.json: ${message}`);
		return {
			content,
			blobSha: createGitBlobSha(Buffer.from(content, 'utf-8')),
			warnings,
		};
	}
}
