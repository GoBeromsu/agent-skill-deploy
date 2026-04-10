export type DeployableIdentityMode = 'root-note' | 'legacy-skill-md';

export interface VaultFolderMarkerFile {
	readonly name: string;
	readonly path: string;
	readonly frontmatter?: Record<string, unknown>;
}

export interface VaultFolderListing {
	readonly folderPath: string;
	readonly folderName: string;
	readonly files: VaultFolderMarkerFile[];
}

export interface DeployableFolderCandidate {
	readonly folderName: string;
	readonly folderPath: string;
	readonly identityMode: DeployableIdentityMode;
	readonly pluginId: string;
	readonly publishGroup: string | null;
	readonly rootNotePath: string | null;
}

export interface DeployableFile {
	readonly relativePath: string;
	readonly content: string;
	readonly encoding: 'utf-8' | 'base64';
	readonly blobSha: string;
	readonly size: number;
}

export interface DeployableFolder extends DeployableFolderCandidate {
	readonly files: DeployableFile[];
	readonly snapshotHash: string;
}

export interface PackagedFile {
	readonly path: string;
	readonly content: string;
	readonly encoding: 'utf-8' | 'base64';
	readonly blobSha: string;
	readonly groupName: string;
}

export interface PackagingResult {
	readonly managedSkillsPath: string;
	readonly files: PackagedFile[];
	readonly warnings: string[];
}

export interface RemoteBlobEntry {
	readonly path: string;
	readonly sha: string;
}

export interface RemoteManagedTree {
	readonly rootTreeSha: string;
	readonly managedTreeSha: string | null;
	readonly files: RemoteBlobEntry[];
}

export interface MirrorCommitFile {
	readonly path: string;
	readonly content: string;
	readonly encoding: 'utf-8' | 'base64';
	readonly blobSha: string;
	readonly groupName?: string;
}

export interface MirrorPlan {
	readonly addedFolders: string[];
	readonly updatedFolders: string[];
	readonly unchangedFolders: string[];
	readonly deletedFolders: string[];
	readonly filesToUpsert: MirrorCommitFile[];
	readonly filesToDelete: string[];
}

export interface DiscoveryResult {
	readonly folders: DeployableFolderCandidate[];
	readonly warnings: string[];
}
