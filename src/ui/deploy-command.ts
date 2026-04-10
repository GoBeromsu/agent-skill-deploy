import type { App } from 'obsidian';
import type { DeployableFolder, MirrorPlan } from '../types/skill';
import type { SkillDeploySettings } from '../types/settings';
import type { PluginLogger } from '../shared/plugin-logger';
import type { PluginNotices } from '../shared/plugin-notices';
import type { GitHubApiClient } from './github-api';
import type { GitHubAuth } from './github-auth';
import type { VaultAdapter } from './vault-adapter';
import { DeployConflictError } from './github-api';
import { hasConflict } from '../domain/deploy-state';
import { buildMirrorPlan } from '../domain/mirror-plan';
import { buildPackagingResult } from '../domain/package-layout';
import { discoverDeployableFolders } from '../domain/skill-discovery';

export class DeployCommand {
	constructor(
		private readonly _app: App,
		private readonly settings: SkillDeploySettings,
		private readonly logger: PluginLogger,
		private readonly notices: PluginNotices,
		private readonly githubApi: GitHubApiClient,
		private readonly auth: GitHubAuth,
		private readonly vaultAdapter: VaultAdapter,
		private readonly saveSettings: () => Promise<void>,
	) {}

	async execute(): Promise<void> {
		if (!this.settings.managedSetupApprovedAt) {
			this.notices.show('config_invalid', { errors: 'Approve the managed setup before deploying.' });
			return;
		}

		const connection = await this.auth.getConnectionState();
		const token = await this.auth.getToken();
		if (!token) {
			this.notices.show('config_invalid', { errors: this.getConnectionErrors(connection).join(' | ') });
			return;
		}

		if (!this.hasRepositoryConfig()) {
			this.notices.show('config_invalid', { errors: 'Repository owner, name, and branch are required.' });
			return;
		}

		if (!this.vaultAdapter.folderExists(this.settings.sourceRootPath)) {
			this.notices.show('config_invalid', { errors: `Source root not found: ${this.settings.sourceRootPath}` });
			return;
		}

		const local = await this.collectLocalFolders();
		if (local.folders.length === 0) {
			this.notices.show('no_folders_found', { path: this.settings.sourceRootPath });
			return;
		}

		for (const warning of local.warnings) {
			this.logger.warn('Discovery warning', { warning });
		}

		const packaging = await buildPackagingResult(this.settings, local.folders, this.vaultAdapter);
		for (const warning of packaging.warnings) {
			this.logger.warn('Packaging warning', { warning });
		}

		const remoteTree = await this.githubApi.getManagedTree(
			this.settings.repoOwner,
			this.settings.repoName,
			this.settings.branch,
			[packaging.managedSkillsPath, ...packaging.files.map(file => file.path)],
			token,
		);
		const plan = buildMirrorPlan(packaging.files, remoteTree);

		if (plan.filesToUpsert.length === 0 && plan.filesToDelete.length === 0) {
			await this.maybeRefreshDeployState(remoteTree.managedTreeSha);
			this.notices.show('deploy_no_changes', {
				total: local.folders.length,
				unchanged: plan.unchangedFolders.length,
			});
			return;
		}

		const lastRemoteTreeSha = this.settings.deployState?.lastRemoteTreeSha ?? null;
		if (this.settings.deployState && hasConflict(remoteTree.managedTreeSha, lastRemoteTreeSha)) {
			const conflictedFolders = [
				...plan.addedFolders,
				...plan.updatedFolders,
				...plan.deletedFolders,
			];
			this.notices.show('deploy_conflict', {
				folders: conflictedFolders.join(', '),
			});
			return;
		}

		try {
			const commitResult = await this.githubApi.createAtomicCommit(
				this.settings.repoOwner,
				this.settings.repoName,
				this.settings.branch,
				plan.filesToUpsert,
				plan.filesToDelete,
				this.buildCommitMessage(plan),
				token,
			);

			const nextRemoteTree = await this.githubApi.getManagedTree(
				this.settings.repoOwner,
				this.settings.repoName,
				this.settings.branch,
				[packaging.managedSkillsPath, ...packaging.files.map(file => file.path)],
				token,
			);

			this.settings.deployState = {
				lastRemoteTreeSha: nextRemoteTree.managedTreeSha,
				lastDeployedAt: new Date().toISOString(),
				commitSha: commitResult.commitSha,
			};
			await this.saveSettings();

			this.notices.show('deploy_success', {
				added: plan.addedFolders.length,
				updated: plan.updatedFolders.length,
				deleted: plan.deletedFolders.length,
				commit: commitResult.commitSha.slice(0, 7),
			});
		} catch (error) {
			if (error instanceof DeployConflictError) {
				this.notices.show('deploy_conflict', {
					folders: [...plan.updatedFolders, ...plan.deletedFolders, ...plan.addedFolders].join(', '),
				});
				return;
			}
			this.logger.error('Deploy failed', error);
			const message = error instanceof Error ? error.message : String(error);
			this.notices.show('deploy_failed', { errors: message });
		}
	}

	async validateConfiguration(): Promise<void> {
		const errors: string[] = [];
		if (!this.settings.managedSetupApprovedAt) {
			errors.push('Managed setup has not been approved yet');
		}
		if (!this.vaultAdapter.folderExists(this.settings.sourceRootPath)) {
			errors.push(`Source root not found: ${this.settings.sourceRootPath}`);
		}
		if (!this.settings.repoOwner.trim()) errors.push('Repository owner is required');
		if (!this.settings.repoName.trim()) errors.push('Repository name is required');
		if (!this.settings.branch.trim()) errors.push('Branch is required');

		const connection = await this.auth.getConnectionState();
		errors.push(...this.getConnectionErrors(connection));

		const local = this.vaultAdapter.folderExists(this.settings.sourceRootPath)
			? await this.collectLocalFolders()
			: { folders: [], warnings: [] };

		if (errors.length > 0) {
			this.notices.show('config_invalid', { errors: errors.join(' | ') });
			return;
		}

		this.notices.show('config_valid', {
			total: local.folders.length,
			warnings: local.warnings.length,
		});
	}

	private async collectLocalFolders(): Promise<{ folders: DeployableFolder[]; warnings: string[] }> {
		const listings = this.vaultAdapter.listFolders(this.settings.sourceRootPath);
		const discovery = discoverDeployableFolders(listings);
		const folders = await Promise.all(
			discovery.folders.map(folder => this.vaultAdapter.readDeployableFolder(folder)),
		);
		return { folders, warnings: discovery.warnings };
	}

	private hasRepositoryConfig(): boolean {
		return [
			this.settings.repoOwner,
			this.settings.repoName,
			this.settings.branch,
		].every(value => value.trim() !== '');
	}

	private buildCommitMessage(plan: MirrorPlan): string {
		return `mirror: sync ${plan.addedFolders.length + plan.updatedFolders.length} folder(s) and delete ${plan.deletedFolders.length}`;
	}

	private getConnectionErrors(connection: Awaited<ReturnType<GitHubAuth['getConnectionState']>>): string[] {
		if (connection.authSource !== 'none') {
			return [];
		}
		if (connection.deployBlockedReasons.length > 0) {
			return connection.deployBlockedReasons;
		}
		return ['Connect GitHub or configure a token fallback'];
	}

	private async maybeRefreshDeployState(remoteTreeSha: string | null): Promise<void> {
		if (this.settings.deployState?.lastRemoteTreeSha === remoteTreeSha) return;
		if (!this.settings.deployState) {
			this.settings.deployState = {
				lastRemoteTreeSha: remoteTreeSha,
				lastDeployedAt: new Date().toISOString(),
				commitSha: '',
			};
		} else {
			this.settings.deployState.lastRemoteTreeSha = remoteTreeSha;
			this.settings.deployState.lastDeployedAt = new Date().toISOString();
		}
		await this.saveSettings();
	}
}
