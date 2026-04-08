export function hasConflict(remoteTreeSha: string | null, lastDeployTreeSha: string | null): boolean {
	return normalizeTreeSha(remoteTreeSha) !== normalizeTreeSha(lastDeployTreeSha);
}

export function isFirstDeploy(lastDeployTreeSha: string | undefined | null): boolean {
	return normalizeTreeSha(lastDeployTreeSha) === null;
}

function normalizeTreeSha(treeSha: string | null | undefined): string | null {
	if (!treeSha) return null;
	return treeSha.trim() === '' ? null : treeSha;
}
