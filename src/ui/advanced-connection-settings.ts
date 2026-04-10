import { Setting } from 'obsidian';
import type { GitHubConnectionState, SkillDeploySettings } from '../types/settings';
import type { GitHubAuth } from './github-auth';
import type { PluginLogger } from '../shared/plugin-logger';
import type { PluginNotices } from '../shared/plugin-notices';

interface AdvancedConnectionSettingsOptions {
	containerEl: HTMLElement;
	settings: SkillDeploySettings;
	connection: GitHubConnectionState;
	auth: GitHubAuth;
	logger: PluginLogger;
	notices: PluginNotices;
	pendingToken: string;
	setPendingToken: (value: string) => void;
	saveSettings: () => Promise<void>;
	rerender: () => void;
}

export function renderAdvancedConnectionSettings(options: AdvancedConnectionSettingsOptions): void {
	new Setting(options.containerEl).setName('Advanced connection').setHeading();

	new Setting(options.containerEl)
		.setName('Token fallback')
		.setDesc(options.connection.tokenFallbackAvailable
			? `Stored for ${options.connection.username ?? 'the current account'}. Use this only when local credential reuse is unavailable.`
			: 'Optional fallback when local credential reuse is unavailable.')
		.addText(text => {
			text.setPlaceholder('Paste a fallback token')
			text.inputEl.type = 'password';
			text.onChange(value => {
				options.setPendingToken(value.trim());
			});
		})
		.addButton(btn => btn
			.setButtonText('Save token')
			.setCta()
			.onClick(async () => {
				try {
					const stored = await options.auth.setToken(options.pendingToken);
					options.setPendingToken('');
					options.notices.show('auth_success', { username: stored.username });
					options.rerender();
				} catch (error) {
					options.logger.noticeError('Token validation failed', error);
				}
			}))
		.addButton(btn => btn
			.setButtonText('Clear token')
			.onClick(async () => {
				await options.auth.logout();
				options.rerender();
			}));

	renderTextSetting(options, 'Repository owner', options.settings.repoOwner, 'Repository owner', async value => {
		options.settings.repoOwner = value.trim();
		await options.saveSettings();
	});
	renderTextSetting(options, 'Repository name', options.settings.repoName, 'Repository name', async value => {
		options.settings.repoName = value.trim();
		await options.saveSettings();
	});
	renderTextSetting(options, 'Branch', options.settings.branch, 'Default branch', async value => {
		options.settings.branch = value.trim() || 'main';
		await options.saveSettings();
	});
	renderTextSetting(options, 'Managed skills path', options.settings.managedSkillsPath, 'Managed skills path', async value => {
		options.settings.managedSkillsPath = value.trim() || 'skills';
		await options.saveSettings();
	}, 'Claude marketplace skills subtree.');
	renderTextSetting(options, 'Codex plugin path', options.settings.codexPluginPath, 'Codex plugin path', async value => {
		options.settings.codexPluginPath = value.trim() || 'plugins/ataraxia-skills';
		await options.saveSettings();
	}, 'Current packaged plugin root for Codex builds.');
	renderTextSetting(options, 'Codex plugin name', options.settings.codexPluginName, 'Codex plugin name', async value => {
		options.settings.codexPluginName = value.trim() || 'ataraxia-skills';
		await options.saveSettings();
	}, 'Current `.codex-plugin/plugin.json` name field.');

	new Setting(options.containerEl)
		.setName('Target provider')
		.setDesc('Advanced provider-specific packaging override.')
		.addDropdown(dropdown => {
			dropdown.addOption('claude-marketplace', 'Claude marketplace');
			dropdown.addOption('codex-plugin', 'Codex plugin');
			dropdown.setValue(options.settings.targetProvider);
			dropdown.onChange(async value => {
				options.settings.targetProvider = value as SkillDeploySettings['targetProvider'];
				await options.saveSettings();
			});
		});
}

function renderTextSetting(
	options: AdvancedConnectionSettingsOptions,
	name: string,
	value: string,
	placeholder: string,
	onChange: (value: string) => Promise<void>,
	desc?: string,
): void {
	new Setting(options.containerEl)
		.setName(name)
		.setDesc(desc ?? '')
		.addText(text => text
			.setPlaceholder(placeholder)
			.setValue(value)
			.onChange(onChange));
}
