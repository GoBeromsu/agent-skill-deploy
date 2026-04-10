import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { GitHubConnectionState, SkillDeploySettings } from '../types/settings';
import type { GitHubAuth } from './github-auth';
import type { PluginLogger } from '../shared/plugin-logger';
import type { PluginNotices } from '../shared/plugin-notices';
import { renderAdvancedConnectionSettings } from './advanced-connection-settings';

interface SettingsHost {
	settings: SkillDeploySettings;
	saveSettings(): Promise<void>;
}

export class SkillDeploySettingTab extends PluginSettingTab {
	private readonly host: SettingsHost;
	private readonly auth: GitHubAuth;
	private readonly logger: PluginLogger;
	private readonly notices: PluginNotices;
	private readonly validateConfiguration: () => Promise<void>;
	private pendingToken = '';
	private showAdvancedConnection = false;

	constructor(
		app: App,
		plugin: Plugin & SettingsHost,
		auth: GitHubAuth,
		logger: PluginLogger,
		notices: PluginNotices,
		validateConfiguration: () => Promise<void>,
	) {
		super(app, plugin);
		this.host = plugin;
		this.auth = auth;
		this.logger = logger;
		this.notices = notices;
		this.validateConfiguration = validateConfiguration;
	}

	display(): void {
		void this.render();
	}

	private async render(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const connection = await this.auth.getConnectionState();
		this.renderManagedPublishing(containerEl, connection);
		this.renderSource(containerEl);
		if (this.showAdvancedConnection) this.renderAdvancedConnection(containerEl, connection);
	}

	private renderManagedPublishing(containerEl: HTMLElement, connection: GitHubConnectionState): void {
		new Setting(containerEl).setName('Managed publishing').setHeading();

		new Setting(containerEl)
			.setName('Setup status')
			.setDesc(this.describeSetupStatus(connection))
			.addButton(btn => btn
				.setButtonText(this.host.settings.managedSetupApprovedAt ? 'Approved' : 'Approve recommended setup')
				.setCta()
				.setDisabled(this.host.settings.managedSetupApprovedAt !== null)
				.onClick(async () => {
					this.host.settings.managedSetupApprovedAt = new Date().toISOString();
					await this.host.saveSettings();
					this.notices.show('setup_approved', { repo: this.getTargetRepoLabel() });
					void this.render();
				}));

		new Setting(containerEl)
			.setName('Target repository')
			.setDesc(this.getTargetRepoLabel());

		new Setting(containerEl)
			.setName('GitHub capability')
			.setDesc(this.describeCapabilityState(connection));

		new Setting(containerEl)
			.setName('Connection actions')
			.setDesc('Manage the current connection without returning to raw provider settings by default.')
			.addButton(btn => btn
				.setButtonText(this.showAdvancedConnection ? 'Hide advanced settings' : 'Edit connection')
				.onClick(() => {
					this.showAdvancedConnection = !this.showAdvancedConnection;
					void this.render();
				}))
			.addButton(btn => btn
				.setButtonText('Validate')
				.onClick(async () => {
					await this.validateConfiguration();
				}))
			.addButton(btn => btn
				.setButtonText('Disconnect')
				.setWarning()
				.onClick(async () => {
					this.host.settings.managedSetupApprovedAt = null;
					this.host.settings.deployState = null;
					await this.auth.logout();
					await this.host.saveSettings();
					this.notices.show('setup_disconnected');
					void this.render();
				}));
	}

	private renderSource(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Source').setHeading();
		new Setting(containerEl)
			.setName('Source root path')
			.setDesc('Vault folder to scan recursively for deployable folders.')
			.addText(text => text
				.setPlaceholder('Path to your skills folder')
				.setValue(this.host.settings.sourceRootPath)
				.onChange(async value => {
					this.host.settings.sourceRootPath = value.trim();
					await this.host.saveSettings();
				}));
	}

	private describeSetupStatus(connection: GitHubConnectionState): string {
		if (!this.host.settings.managedSetupApprovedAt) {
			return `Approve the recommended managed setup for ${this.getTargetRepoLabel()} to enable deploy. Current auth source: ${this.describeAuthSource(connection)}.`;
		}
		return `Managed setup approved. Deploy will target ${this.getTargetRepoLabel()} using ${this.describeAuthSource(connection)} when available.`;
	}

	private describeCapabilityState(connection: GitHubConnectionState): string {
		const localStatus = connection.localCredentialAvailable
			? `Local GitHub reuse is available${connection.username ? ` for ${connection.username}` : ''}.`
			: `Local GitHub reuse is unavailable. ${connection.localBlockedReasons.join(' ')}`.trim();
		const fallbackStatus = connection.tokenFallbackAvailable
			? 'Token fallback is configured.'
			: 'Token fallback is not configured.';
		const deployStatus = connection.deployBlockedReasons.length === 0
			? 'Deploy prerequisites are satisfied.'
			: `Deploy is blocked: ${connection.deployBlockedReasons.join(' ')}`;
		return [localStatus, fallbackStatus, deployStatus].join('\n');
	}

	private describeAuthSource(connection: GitHubConnectionState): string {
		if (connection.authSource === 'stored-token') return 'the stored token fallback';
		if (connection.authSource === 'local-gh') return 'reused local GitHub CLI credentials';
		return 'no active GitHub connection';
	}

	private getTargetRepoLabel(): string {
		return `${this.host.settings.repoOwner}/${this.host.settings.repoName}@${this.host.settings.branch}`;
	}

	private renderAdvancedConnection(containerEl: HTMLElement, connection: GitHubConnectionState): void {
		renderAdvancedConnectionSettings({
			containerEl,
			settings: this.host.settings,
			connection,
			auth: this.auth,
			logger: this.logger,
			notices: this.notices,
			pendingToken: this.pendingToken,
			setPendingToken: value => {
				this.pendingToken = value;
			},
			saveSettings: () => this.host.saveSettings(),
			rerender: () => {
				void this.render();
			},
		});
	}
}
