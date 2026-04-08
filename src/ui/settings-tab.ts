/* eslint-disable obsidianmd/ui/sentence-case -- settings contain proper nouns (GitHub App, Client ID) and example paths */
import { App, PluginSettingTab, Setting } from 'obsidian';
import type { SkillDeploySettings } from '../types/settings';
import type { GitHubAuth } from './github-auth';
import type { PluginLogger } from '../shared/plugin-logger';
import type { PluginNotices } from '../shared/plugin-notices';

interface SettingsHost {
	settings: SkillDeploySettings;
	saveSettings(): Promise<void>;
}

export class SkillDeploySettingTab extends PluginSettingTab {
	private readonly host: SettingsHost;
	private readonly auth: GitHubAuth;
	private readonly logger: PluginLogger;
	private readonly notices: PluginNotices;

	constructor(app: App, host: SettingsHost, auth: GitHubAuth, logger: PluginLogger, notices: PluginNotices) {
		super(app, host as never);
		this.host = host;
		this.auth = auth;
		this.logger = logger;
		this.notices = notices;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderAuthentication(containerEl);
		this.renderSkillsSource(containerEl);
		this.renderTarget(containerEl);
		this.renderRepository(containerEl);
	}

	private renderAuthentication(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Authentication').setHeading();
		let pendingToken = '';

		const authSetting = new Setting(containerEl)
			.setName('GitHub personal access token');

		void this.auth.getUsername().then(username => {
			authSetting.setDesc(
				username
					? `Stored for ${username}. Use a PAT with repository Contents write access.`
					: 'Store a GitHub PAT with repository Contents write access.',
			);
			authSetting.addText(text => {
				text.setPlaceholder('github_pat_...');
				text.inputEl.type = 'password';
				text.onChange((value) => {
					pendingToken = value.trim();
				});
			});
			authSetting.addButton(btn => btn
				.setButtonText('Save token')
				.setCta()
				.onClick(async () => {
					try {
						const stored = await this.auth.setToken(pendingToken);
						this.notices.show('auth_success', { username: stored.username });
						this.display();
					} catch (err) {
						this.logger.noticeError('PAT validation failed', err);
					}
				}));
			authSetting.addButton(btn => btn
				.setButtonText('Clear token')
				.setWarning()
				.onClick(async () => {
					await this.auth.logout();
					this.display();
				}));
		});
	}

	private renderSkillsSource(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Source').setHeading();

		new Setting(containerEl)
			.setName('Source root path')
			.setDesc('Vault folder to scan recursively for deployable folders.')
			.addText(text => text
				.setPlaceholder('55. Tools/Skills')
				.setValue(this.host.settings.sourceRootPath)
				.onChange(async (value) => {
					this.host.settings.sourceRootPath = value.trim();
					await this.host.saveSettings();
				}));
	}

	private renderRepository(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Repository').setHeading();

		new Setting(containerEl)
			.setName('Repository owner')
			.addText(text => text
				.setPlaceholder('GoBeromsu')
				.setValue(this.host.settings.repoOwner)
				.onChange(async (value) => {
					this.host.settings.repoOwner = value.trim();
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Repository name')
			.addText(text => text
				.setPlaceholder('claude-code-plugins')
				.setValue(this.host.settings.repoName)
				.onChange(async (value) => {
					this.host.settings.repoName = value.trim();
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Branch')
			.addText(text => text
				.setPlaceholder('main')
				.setValue(this.host.settings.branch)
				.onChange(async (value) => {
					this.host.settings.branch = value.trim() || 'main';
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Managed skills path')
			.setDesc('Claude marketplace skills subtree. Usually `skills`.')
			.addText(text => text
				.setPlaceholder('skills')
				.setValue(this.host.settings.managedSkillsPath)
				.onChange(async (value) => {
					this.host.settings.managedSkillsPath = value.trim() || 'skills';
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Codex plugin path')
			.setDesc('Plugin package root for Codex builds.')
			.addText(text => text
				.setPlaceholder('plugins/ataraxia-skills')
				.setValue(this.host.settings.codexPluginPath)
				.onChange(async (value) => {
					this.host.settings.codexPluginPath = value.trim() || 'plugins/ataraxia-skills';
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Codex plugin name')
			.setDesc('The `.codex-plugin/plugin.json` name field.')
			.addText(text => text
				.setPlaceholder('ataraxia-skills')
				.setValue(this.host.settings.codexPluginName)
				.onChange(async (value) => {
					this.host.settings.codexPluginName = value.trim() || 'ataraxia-skills';
					await this.host.saveSettings();
				}));
	}

	private renderTarget(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Target').setHeading();

		new Setting(containerEl)
			.setName('Target provider')
			.setDesc('Claude uses a marketplace repo shape. Codex uses a plugin package shape.')
			.addDropdown(dropdown => {
				dropdown.addOption('claude-marketplace', 'Claude marketplace');
				dropdown.addOption('codex-plugin', 'Codex plugin');
				dropdown.setValue(this.host.settings.targetProvider);
				dropdown.onChange(async (value) => {
					this.host.settings.targetProvider = value as SkillDeploySettings['targetProvider'];
					await this.host.saveSettings();
					this.display();
				});
			});
	}
}
