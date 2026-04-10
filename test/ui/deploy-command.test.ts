import { describe, expect, it, vi } from 'vitest';
import { DeployCommand } from '../../src/ui/deploy-command';
import type { SkillDeploySettings } from '../../src/types/settings';

function makeSettings(overrides: Partial<SkillDeploySettings> = {}): SkillDeploySettings {
	return {
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
		...overrides,
	};
}

describe('DeployCommand', () => {
	it('blocks execute until managed setup is approved', async () => {
		const notices = { show: vi.fn() };
		const command = new DeployCommand(
			{} as never,
			makeSettings(),
			{ warn: vi.fn(), error: vi.fn() } as never,
			notices as never,
			{} as never,
			{} as never,
			{} as never,
			vi.fn().mockResolvedValue(undefined),
		);

		await command.execute();

		expect(notices.show).toHaveBeenCalledWith('config_invalid', {
			errors: 'Approve the managed setup before deploying.',
		});
	});

	it('reports capability blockers during configuration validation', async () => {
		const notices = { show: vi.fn() };
		const auth = {
			getConnectionState: vi.fn().mockResolvedValue({
				authSource: 'none',
				deployBlockedReasons: ['Install git to enable local GitHub credential reuse.'],
			}),
		};
		const vaultAdapter = {
			folderExists: vi.fn().mockReturnValue(true),
			listFolders: vi.fn().mockReturnValue([]),
			readDeployableFolder: vi.fn(),
		};
		const command = new DeployCommand(
			{} as never,
			makeSettings(),
			{ warn: vi.fn(), error: vi.fn() } as never,
			notices as never,
			{} as never,
			auth as never,
			vaultAdapter as never,
			vi.fn().mockResolvedValue(undefined),
		);

		await command.validateConfiguration();

		expect(notices.show).toHaveBeenCalledWith('config_invalid', {
			errors: 'Managed setup has not been approved yet | Install git to enable local GitHub credential reuse.',
		});
	});
});
