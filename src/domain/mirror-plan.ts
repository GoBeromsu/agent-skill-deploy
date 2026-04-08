import type { MirrorPlan, PackagedFile, RemoteManagedTree } from '../types/skill';

export function buildMirrorPlan(
	localFiles: readonly PackagedFile[],
	remoteTree: RemoteManagedTree,
): MirrorPlan {
	const localFileMap = new Map<string, { groupName: string; blobSha: string; content: string; encoding: 'utf-8' | 'base64' }>();
	const remoteFiles = new Map<string, string>();

	for (const file of localFiles) {
		localFileMap.set(normalizeRepoPath(file.path), {
			groupName: file.groupName,
			blobSha: file.blobSha,
			content: file.content,
			encoding: file.encoding,
		});
	}

	for (const file of remoteTree.files) {
		remoteFiles.set(normalizeRepoPath(file.path), file.sha);
	}

	const addedFolders: string[] = [];
	const updatedFolders: string[] = [];
	const unchangedFolders: string[] = [];
	const groupedLocalPaths = new Map<string, string[]>();
	const skillContainerPrefixes = new Set<string>();

	for (const file of localFiles) {
		const existing = groupedLocalPaths.get(file.groupName);
		if (existing) {
			existing.push(file.path);
			continue;
		}
		groupedLocalPaths.set(file.groupName, [file.path]);

		const prefix = inferSkillContainerPrefix(file);
		if (prefix !== null) {
			skillContainerPrefixes.add(prefix);
		}
	}

	for (const [groupName, groupPaths] of groupedLocalPaths.entries()) {
		const normalizedPaths = groupPaths.map(path => normalizeRepoPath(path));
		const remoteFolderFiles = normalizedPaths.filter(path => remoteFiles.has(path));
		const hasRemoteFiles = remoteFolderFiles.length > 0;
		const allFilesMatch = normalizedPaths.every(path => {
			const local = localFileMap.get(path);
			const remoteSha = remoteFiles.get(path);
			return local !== undefined && remoteSha === local.blobSha;
		});
		const hasSameCardinality = normalizedPaths.length === remoteFolderFiles.length;

		if (!hasRemoteFiles) {
			addedFolders.push(groupName);
			continue;
		}

		if (allFilesMatch && hasSameCardinality) {
			unchangedFolders.push(groupName);
			continue;
		}

		updatedFolders.push(groupName);
	}

	const localGroupNames = new Set(groupedLocalPaths.keys());
	const deletedFolders = [...new Set(
		[...remoteFiles.keys()]
			.map(path => inferDeletedSkillGroupName(path, skillContainerPrefixes))
			.filter((groupName): groupName is string => groupName !== null && !localGroupNames.has(groupName)),
	)]
		.sort((left, right) => left.localeCompare(right));

	const filesToUpsert = [...localFileMap.entries()]
		.filter(([path, file]) => remoteFiles.get(path) !== file.blobSha)
		.map(([path, file]) => ({
			path,
			content: file.content,
			encoding: file.encoding,
			blobSha: file.blobSha,
			groupName: file.groupName,
		}))
		.sort((left, right) => left.path.localeCompare(right.path));

	const filesToDelete = [...remoteFiles.keys()]
		.filter(path => !localFileMap.has(path))
		.sort((left, right) => left.localeCompare(right));

	return {
		addedFolders: addedFolders.sort((left, right) => left.localeCompare(right)),
		updatedFolders: updatedFolders.sort((left, right) => left.localeCompare(right)),
		unchangedFolders: unchangedFolders.sort((left, right) => left.localeCompare(right)),
		deletedFolders,
		filesToUpsert,
		filesToDelete,
	};
}

export function normalizeRepoPath(...parts: string[]): string {
	return parts
		.flatMap(part => part.split('/'))
		.map(part => part.trim())
		.filter(part => part !== '')
		.join('/');
}

function inferSkillContainerPrefix(file: PackagedFile): string | null {
	if (file.groupName.startsWith('.')) return null;

	const normalizedPath = normalizeRepoPath(file.path);
	const directPrefix = `${file.groupName}/`;
	if (normalizedPath.startsWith(directPrefix)) {
		return '';
	}

	const marker = `/${file.groupName}/`;
	const markerIndex = normalizedPath.indexOf(marker);
	if (markerIndex === -1) return null;
	return normalizedPath.slice(0, markerIndex);
}

function inferDeletedSkillGroupName(path: string, skillContainerPrefixes: ReadonlySet<string>): string | null {
	const normalizedPath = normalizeRepoPath(path);

	for (const prefix of skillContainerPrefixes) {
		if (prefix === '') {
			const [groupName] = normalizedPath.split('/');
			return groupName ?? null;
		}

		const containerPrefix = `${prefix}/`;
		if (!normalizedPath.startsWith(containerPrefix)) continue;

		const remainder = normalizedPath.slice(containerPrefix.length);
		const [groupName] = remainder.split('/');
		return groupName ?? null;
	}

	return null;
}
