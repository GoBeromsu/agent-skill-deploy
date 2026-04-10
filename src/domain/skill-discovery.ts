import type { DeployableFolderCandidate, DiscoveryResult, VaultFolderListing } from '../types/skill';

export function discoverDeployableFolders(folders: readonly VaultFolderListing[]): DiscoveryResult {
	const selected: DeployableFolderCandidate[] = [];
	const warnings: string[] = [];
	const sortedFolders = folders
		.slice()
		.sort((left, right) => depthOf(left.folderPath) - depthOf(right.folderPath));

	for (const folder of sortedFolders) {
		if (selected.some(candidate => isNestedFolder(candidate.folderPath, folder.folderPath))) {
			continue;
		}

		const rootNoteName = `${folder.folderName}.md`;
		const rootNote = folder.files.find(file => file.name === rootNoteName);
		const rootPluginId = getPluginId(rootNote?.frontmatter);
		const publishGroup = getPublishGroup(rootNote?.frontmatter);

		if (rootPluginId) {
			selected.push({
				folderName: folder.folderName,
				folderPath: folder.folderPath,
				identityMode: 'root-note',
				pluginId: rootPluginId,
				publishGroup,
				rootNotePath: rootNote?.path ?? null,
			});
			continue;
		}

		const misplacedPluginNotes = folder.files
			.filter(file => file.name !== rootNoteName)
			.filter(file => getPluginId(file.frontmatter) !== null);

		if (misplacedPluginNotes.length > 0) {
			warnings.push(
				`${folder.folderPath}: deployable note must be named ${rootNoteName}; ignored ${misplacedPluginNotes
					.map(file => file.name)
					.join(', ')}`,
			);
		}

		const legacySkill = folder.files.find(file => file.name === 'SKILL.md');
		if (!legacySkill) continue;

		selected.push({
			folderName: folder.folderName,
			folderPath: folder.folderPath,
			identityMode: 'legacy-skill-md',
			pluginId: folder.folderName,
			publishGroup: null,
			rootNotePath: null,
		});
	}

	return { folders: selected, warnings };
}

function getPluginId(frontmatter?: Record<string, unknown>): string | null {
	const pluginId = frontmatter?.['plugin_id'];
	if (typeof pluginId !== 'string') return null;

	const normalized = pluginId.trim();
	return normalized === '' ? null : normalized;
}


function getPublishGroup(frontmatter?: Record<string, unknown>): string | null {
	const publishGroup = frontmatter?.['publish_group'];
	if (typeof publishGroup !== 'string') return null;

	const normalized = publishGroup.trim();
	return normalized === '' ? null : normalized;
}

function isNestedFolder(parentPath: string, childPath: string): boolean {
	const normalizedParent = `${parentPath.replace(/\/+$/g, '')}/`;
	return childPath !== parentPath && childPath.startsWith(normalizedParent);
}

function depthOf(path: string): number {
	return path.split('/').filter(Boolean).length;
}
