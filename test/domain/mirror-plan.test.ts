import { describe, expect, it } from 'vitest';
import { buildMirrorPlan } from '../../src/domain/mirror-plan';
import type { PackagedFile, RemoteManagedTree } from '../../src/types/skill';

function makeGroup(
	groupName: string,
	files: Array<{ path: string; blobSha: string; content?: string; encoding?: 'utf-8' | 'base64' }>,
): PackagedFile[] {
	return files.map(file => ({
		path: file.path,
		blobSha: file.blobSha,
		content: file.content ?? `${groupName}:${file.path}`,
		encoding: file.encoding ?? 'utf-8',
		groupName,
	}));
}

describe('buildMirrorPlan', () => {
	it('computes added, updated, unchanged, and deleted folders', () => {
		const localFiles: PackagedFile[] = [
			...makeGroup('new-skill', [
				{ path: 'skills/new-skill/new-skill.md', blobSha: 'sha-new' },
			]),
			...makeGroup('same-skill', [
				{ path: 'skills/same-skill/same-skill.md', blobSha: 'sha-same' },
			]),
			...makeGroup('updated-skill', [
				{ path: 'skills/updated-skill/updated-skill.md', blobSha: 'sha-next' },
				{ path: 'skills/updated-skill/nested/file.txt', blobSha: 'sha-nested' },
			]),
		];
		const remoteTree: RemoteManagedTree = {
			rootTreeSha: 'root-tree',
			managedTreeSha: 'managed-tree',
			files: [
				{ path: 'skills/same-skill/same-skill.md', sha: 'sha-same' },
				{ path: 'skills/updated-skill/updated-skill.md', sha: 'sha-old' },
				{ path: 'skills/deleted-skill/SKILL.md', sha: 'sha-delete' },
			],
		};

		const plan = buildMirrorPlan(localFiles, remoteTree);
		expect(plan.addedFolders).toEqual(['new-skill']);
		expect(plan.updatedFolders).toEqual(['updated-skill']);
		expect(plan.unchangedFolders).toEqual(['same-skill']);
		expect(plan.deletedFolders).toEqual(['deleted-skill']);
		expect(plan.filesToUpsert.map(file => file.path)).toEqual([
			'skills/new-skill/new-skill.md',
			'skills/updated-skill/nested/file.txt',
			'skills/updated-skill/updated-skill.md',
		]);
		expect(plan.filesToDelete).toEqual(['skills/deleted-skill/SKILL.md']);
	});

	it('produces no changes for an exact mirror, including nested files', () => {
		const localFiles: PackagedFile[] = [
			...makeGroup('nested-skill', [
				{ path: 'skills/nested-skill/nested-skill.md', blobSha: 'sha-root' },
				{ path: 'skills/nested-skill/references/doc.md', blobSha: 'sha-doc' },
			]),
		];
		const remoteTree: RemoteManagedTree = {
			rootTreeSha: 'root-tree',
			managedTreeSha: 'managed-tree',
			files: [
				{ path: 'skills/nested-skill/nested-skill.md', sha: 'sha-root' },
				{ path: 'skills/nested-skill/references/doc.md', sha: 'sha-doc' },
			],
		};

		const plan = buildMirrorPlan(localFiles, remoteTree);
		expect(plan.addedFolders).toEqual([]);
		expect(plan.updatedFolders).toEqual([]);
		expect(plan.deletedFolders).toEqual([]);
		expect(plan.filesToUpsert).toEqual([]);
		expect(plan.filesToDelete).toEqual([]);
		expect(plan.unchangedFolders).toEqual(['nested-skill']);
	});

	it('ignores non-managed metadata when the remote tree is already scope-filtered', () => {
		const localFiles: PackagedFile[] = [
			...makeGroup('youtube-upload', [
				{ path: 'skills/youtube-upload/SKILL.md', blobSha: 'sha-upload' },
			]),
		];
		const remoteTree: RemoteManagedTree = {
			rootTreeSha: 'root-tree',
			managedTreeSha: 'managed-tree',
			files: [
				{ path: 'skills/youtube-upload/SKILL.md', sha: 'sha-old-upload' },
				{ path: 'skills/zotero/SKILL.md', sha: 'sha-zotero' },
			],
		};

		const plan = buildMirrorPlan(localFiles, remoteTree);
		expect(plan.filesToUpsert.map(file => file.path)).toEqual(['skills/youtube-upload/SKILL.md']);
		expect(plan.filesToDelete).toEqual(['skills/zotero/SKILL.md']);
		expect(plan.deletedFolders).toEqual(['zotero']);
	});
});
