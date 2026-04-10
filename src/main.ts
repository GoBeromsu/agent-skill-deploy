import { Plugin } from 'obsidian';
import type { SkillDeploySettings } from './types/settings';
import { PluginLogger } from './shared/plugin-logger';
import { PluginNotices, type NoticeCatalog } from './shared/plugin-notices';
import { GitHubApiClient } from './ui/github-api';
import { GitHubAuth } from './ui/github-auth';
import { GitHubLocalAuth } from './ui/github-local-auth';
import { FileSystemTokenStore } from './ui/token-store';
import { VaultAdapter } from './ui/vault-adapter';
import { DeployCommand } from './ui/deploy-command';
import { SkillDeploySettingTab } from './ui/settings-tab';

const NOTICE_CATALOG: NoticeCatalog = {
	auth_required: { template: 'Connect GitHub or configure a token fallback first.', timeout: 5000, immutable: true },
	auth_success: { template: 'Stored GitHub token fallback for {{username}}.', timeout: 3000 },
	setup_approved: { template: 'Managed setup approved for {{repo}}.', timeout: 4000 },
	setup_disconnected: { template: 'Managed setup disconnected. Deploy is now disabled.', timeout: 4000 },
	no_folders_found: { template: 'No deployable folders found under {{path}}.', timeout: 5000 },
	config_valid: { template: 'Configuration valid. Found {{total}} deployable folders ({{warnings}} warnings).', timeout: 5000 },
	config_invalid: { template: 'Configuration invalid: {{errors}}', timeout: 10000 },
	deploy_no_changes: { template: 'No changes to deploy. {{unchanged}}/{{total}} folders are already mirrored.', timeout: 5000 },
	deploy_success: { template: 'Mirror complete. added={{added}} updated={{updated}} deleted={{deleted}} commit={{commit}}', timeout: 7000 },
	deploy_conflict: { template: 'Remote managed tree changed since last deploy. Review folders: {{folders}}', timeout: 10000 },
	deploy_failed: { template: 'Deploy failed: {{errors}}', timeout: 10000 },
};

const DEFAULT_SETTINGS: SkillDeploySettings = {
	sourceRootPath: '55. Tools/Skills',
	repoOwner: 'GoBeromsu',
	repoName: 'claude-code-plugins',
	branch: 'main',
	managedSetupApprovedAt: null,
	targetProvider: 'claude-marketplace',
	managedSkillsPath: 'skills',
	codexPluginPath: 'plugins/ataraxia-skills',
	codexPluginName: 'ataraxia-skills',
	deployState: null,
};

export default class SkillDeployPlugin extends Plugin {
	settings!: SkillDeploySettings;
	private settingsMigrated = false;
	private logger!: PluginLogger;
	private notices!: PluginNotices;
	private auth!: GitHubAuth;

	async onload(): Promise<void> {
		await this.loadSettings();
		if (this.settingsMigrated) {
			await this.saveSettings();
		}

		this.logger = new PluginLogger('SkillDeploy');
		this.notices = new PluginNotices(
			this as unknown as { settings: Record<string, unknown>; saveSettings(): Promise<void> },
			NOTICE_CATALOG,
			'SkillDeploy',
		);

		const githubApi = new GitHubApiClient(this.logger);
		const tokenStore = new FileSystemTokenStore(this.logger);
		const localAuth = new GitHubLocalAuth();
		this.auth = new GitHubAuth(tokenStore, githubApi, this.logger, localAuth);
		const vaultAdapter = new VaultAdapter(this.app);

		const deployCommand = new DeployCommand(
			this.app,
			this.settings,
			this.logger,
			this.notices,
			githubApi,
			this.auth,
			vaultAdapter,
			() => this.saveSettings(),
		);

		this.addCommand({
			id: 'deploy-changed-folders',
			name: 'Deploy changed folders',
			callback: () => {
				void deployCommand.execute();
			},
		});
		this.addCommand({
			id: 'validate-deploy-config',
			name: 'Validate deploy config',
			callback: () => {
				void deployCommand.validateConfiguration();
			},
		});

		this.addSettingTab(new SkillDeploySettingTab(
			this.app,
			{
				settings: this.settings,
				saveSettings: () => this.saveSettings(),
				validateConfiguration: () => deployCommand.validateConfiguration(),
			},
			this.auth,
			this.logger,
			this.notices,
		));

		this.logger.info('Agent Skill Deploy plugin loaded');
	}

	onunload(): void {
		this.notices?.unload();
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData() as Record<string, unknown> | null;
		const migrated = this.migrateSettings(loaded ?? {});
		this.settings = Object.assign({}, DEFAULT_SETTINGS, migrated);
		this.settingsMigrated = shouldPersistMigratedSettings(loaded ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private migrateSettings(loaded: Record<string, unknown>): SkillDeploySettings {
		const settings: SkillDeploySettings = {
			...DEFAULT_SETTINGS,
		};

		const sourceRootPath = readString(loaded['sourceRootPath']) ?? readString(loaded['skillsRootPath']);
		if (sourceRootPath) settings.sourceRootPath = sourceRootPath;

		const repoOwner = readString(loaded['repoOwner']);
		const repoName = readString(loaded['repoName']);
		if (repoOwner) settings.repoOwner = repoOwner;
		if (repoName) settings.repoName = repoName;

		const branch = readString(loaded['branch']);
		if (branch) settings.branch = branch;

		settings.managedSetupApprovedAt = readNullableString(loaded['managedSetupApprovedAt']);

		const targetProvider = readString(loaded['targetProvider']);
		if (targetProvider === 'claude-marketplace' || targetProvider === 'codex-plugin') {
			settings.targetProvider = targetProvider;
		}

		const managedSkillsPath = readString(loaded['managedSkillsPath']);
		if (managedSkillsPath) settings.managedSkillsPath = managedSkillsPath;

		const codexPluginPath = readString(loaded['codexPluginPath']);
		if (codexPluginPath) settings.codexPluginPath = codexPluginPath;

		const codexPluginName = readString(loaded['codexPluginName']);
		if (codexPluginName) settings.codexPluginName = codexPluginName;

		const deployState = loaded['deployState'];
		if (deployState && typeof deployState === 'object') {
			const record = deployState as Record<string, unknown>;
			settings.deployState = {
				lastRemoteTreeSha: readNullableString(record['lastRemoteTreeSha']),
				lastDeployedAt: readString(record['lastDeployedAt']) ?? '',
				commitSha: readString(record['commitSha']) ?? '',
			};
		}

		if ((!settings.repoOwner || !settings.repoName) && Array.isArray(loaded['providers'])) {
			for (const provider of loaded['providers']) {
				if (!provider || typeof provider !== 'object') continue;
				const repoUrl = readString((provider as Record<string, unknown>)['repoUrl']);
				if (!repoUrl) continue;
				const parsed = parseOwnerRepo(repoUrl);
				if (!parsed) continue;
				settings.repoOwner = settings.repoOwner || parsed.owner;
				settings.repoName = settings.repoName || parsed.repo;
				settings.branch = readString((provider as Record<string, unknown>)['branch']) ?? settings.branch;
				settings.managedSkillsPath = readString((provider as Record<string, unknown>)['deployPath']) ?? settings.managedSkillsPath;
				break;
			}
		}

		return settings;
	}
}

function readString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized === '' ? null : normalized;
}

function readNullableString(value: unknown): string | null {
	if (value === null) return null;
	return readString(value);
}

function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
	const normalized = repoUrl.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/i, '');
	const [owner, repo] = normalized.split('/');
	if (!owner || !repo) return null;
	return { owner, repo };
}

function shouldPersistMigratedSettings(loaded: Record<string, unknown>): boolean {
	return 'skillsRootPath' in loaded
		|| 'providers' in loaded
		|| 'githubAppClientId' in loaded
		|| 'deployStates' in loaded
		|| !('sourceRootPath' in loaded)
		|| !('repoOwner' in loaded)
		|| !('repoName' in loaded)
		|| !('branch' in loaded)
		|| !('managedSetupApprovedAt' in loaded)
		|| !('targetProvider' in loaded)
		|| !('managedSkillsPath' in loaded)
		|| !('codexPluginPath' in loaded)
		|| !('codexPluginName' in loaded);
}
