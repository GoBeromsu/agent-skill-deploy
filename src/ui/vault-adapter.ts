import { App, TFile, TFolder } from 'obsidian';
import { createSnapshotHash, encodeVaultFile } from '../domain/blob-sha';
import type {
	DeployableFile,
	DeployableFolder,
	DeployableFolderCandidate,
	VaultFolderListing,
	VaultFolderMarkerFile,
} from '../types/skill';

const IGNORED_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

export class VaultAdapter {
	constructor(private readonly app: App) {}

	listFolders(rootPath: string): VaultFolderListing[] {
		const root = this.app.vault.getAbstractFileByPath(rootPath);
		if (!root || !(root instanceof TFolder)) return [];

		const results: VaultFolderListing[] = [];
		this.collectFolders(root, results);
		return results;
	}

	async readDeployableFolder(candidate: DeployableFolderCandidate): Promise<DeployableFolder> {
		const folder = this.app.vault.getAbstractFileByPath(candidate.folderPath);
		if (!folder || !(folder instanceof TFolder)) {
			throw new Error(`Folder not found: ${candidate.folderPath}`);
		}

		const files = await this.readFolderFiles(folder, folder.path);
		return {
			...candidate,
			files,
			snapshotHash: createSnapshotHash(files),
		};
	}

	folderExists(path: string): boolean {
		const target = this.app.vault.getAbstractFileByPath(path);
		return target instanceof TFolder;
	}

	async readVaultFileByPath(path: string): Promise<DeployableFile | null> {
		const target = this.app.vault.getAbstractFileByPath(path);
		if (!(target instanceof TFile) || IGNORED_FILE_NAMES.has(target.name)) return null;

		const bytes = new Uint8Array(await this.app.vault.readBinary(target));
		const encoded = encodeVaultFile(bytes);
		return {
			relativePath: target.name,
			content: encoded.content,
			encoding: encoded.encoding,
			blobSha: encoded.blobSha,
			size: encoded.size,
		};
	}

	private collectFolders(folder: TFolder, results: VaultFolderListing[]): void {
		for (const child of folder.children) {
			if (!(child instanceof TFolder)) continue;
			results.push({
				folderPath: child.path,
				folderName: child.name,
				files: this.readMarkerFiles(child),
			});
			this.collectFolders(child, results);
		}
	}

	private readMarkerFiles(folder: TFolder): VaultFolderMarkerFile[] {
		const files: VaultFolderMarkerFile[] = [];

		for (const child of folder.children) {
			if (!(child instanceof TFile)) continue;
			files.push({
				name: child.name,
				path: child.path,
				frontmatter: this.app.metadataCache.getFileCache(child)?.frontmatter,
			});
		}

		return files;
	}

	private async readFolderFiles(folder: TFolder, rootPath: string): Promise<DeployableFile[]> {
		const files: DeployableFile[] = [];
		await this.collectFolderFiles(folder, rootPath, files);
		return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	}

	private async collectFolderFiles(folder: TFolder, rootPath: string, files: DeployableFile[]): Promise<void> {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				await this.collectFolderFiles(child, rootPath, files);
				continue;
			}
			if (!(child instanceof TFile) || IGNORED_FILE_NAMES.has(child.name)) continue;

			const bytes = new Uint8Array(await this.app.vault.readBinary(child));
			const encoded = encodeVaultFile(bytes);
			files.push({
				relativePath: this.toRelativePath(rootPath, child.path),
				content: encoded.content,
				encoding: encoded.encoding,
				blobSha: encoded.blobSha,
				size: encoded.size,
			});
		}
	}

	private toRelativePath(rootPath: string, targetPath: string): string {
		const prefix = `${rootPath.replace(/\/+$/g, '')}/`;
		const relative = targetPath.startsWith(prefix) ? targetPath.slice(prefix.length) : targetPath;
		return relative.replace(/\\/g, '/');
	}
}
