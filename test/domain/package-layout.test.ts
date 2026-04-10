import { describe, expect, it } from 'vitest';
import { buildPackagingResult } from '../../src/domain/package-layout';
import type { DeployableFolder } from '../../src/types/skill';
import type { SkillDeploySettings } from '../../src/types/settings';

function makeFolder(folderName: string, overrides: Partial<DeployableFolder> = {}): DeployableFolder {
	return {
		folderName,
		folderPath: `55. Tools/Skills/${folderName}`,
		identityMode: 'legacy-skill-md',
		pluginId: folderName,
		publishGroup: null,
		rootNotePath: null,
		snapshotHash: `${folderName}-hash`,
		files: [
			{
				relativePath: 'SKILL.md',
				content: `name: ${folderName}`,
				encoding: 'utf-8',
				blobSha: `sha-${folderName}`,
				size: 10,
			},
		],
		...overrides,
	};
}

function makeSettings(overrides: Partial<SkillDeploySettings>): SkillDeploySettings {
	return {
		sourceRootPath: '55. Tools/Skills',
		repoOwner: 'GoBeromsu',
		repoName: 'claude-code-plugins',
		branch: 'main',
		targetProvider: 'claude-marketplace',
		managedSkillsPath: 'skills',
		codexPluginPath: 'plugins/ataraxia-skills',
		codexPluginName: 'ataraxia-skills',
		deployState: null,
		...overrides,
	};
}

describe('buildPackagingResult', () => {
	it('packages Claude skills into a skills subtree and rewrites marketplace references', async () => {
		const settings = makeSettings({ targetProvider: 'claude-marketplace', managedSkillsPath: 'skills' });
		const folders = [makeFolder('obsidian-cli')];
		const vaultAdapter = {
			readVaultFileByPath: async () => ({
				relativePath: 'marketplace.json',
				content: JSON.stringify({
					name: 'beomsu-koh',
					plugins: [
						{
							name: 'obsidian-plugin-set',
							skills: ['./obsidian-cli'],
						},
					],
				}),
				encoding: 'utf-8' as const,
				blobSha: 'old-marketplace',
				size: 10,
			}),
		};

		const result = await buildPackagingResult(settings, folders, vaultAdapter as never);
		expect(result.managedSkillsPath).toBe('skills');
		expect(result.files.map(file => file.path)).toEqual([
			'.claude-plugin/marketplace.json',
			'skills/obsidian-cli/SKILL.md',
		]);
		expect(result.files[0]?.content).toContain('./skills/obsidian-cli');
	});

	it('packages Claude skills into an extra nested publish group when provided', async () => {
		const settings = makeSettings({ targetProvider: 'claude-marketplace', managedSkillsPath: 'skills' });
		const folders = [makeFolder('obsidian-cli', { publishGroup: 'dev' })];
		const vaultAdapter = {
			readVaultFileByPath: async () => ({
				relativePath: 'marketplace.json',
				content: JSON.stringify({
					plugins: [
						{ name: 'obsidian-plugin-set', skills: ['./obsidian-cli'] },
					],
				}),
				encoding: 'utf-8' as const,
				blobSha: 'old-marketplace',
				size: 10,
			}),
		};

		const result = await buildPackagingResult(settings, folders, vaultAdapter as never);
		expect(result.files.map(file => file.path)).toEqual([
			'.claude-plugin/marketplace.json',
			'skills/dev/obsidian-cli/SKILL.md',
		]);
		expect(result.files[0]?.content).toContain('./skills/dev/obsidian-cli');
	});

	it('packages Codex skills under a plugin root with plugin.json', async () => {
		const settings = makeSettings({
			targetProvider: 'codex-plugin',
			codexPluginPath: 'plugins/ataraxia-skills',
			codexPluginName: 'ataraxia-skills',
		});
		const folders = [makeFolder('obsidian-cli')];

		const result = await buildPackagingResult(settings, folders, { readVaultFileByPath: async () => null } as never);
		expect(result.managedSkillsPath).toBe('plugins/ataraxia-skills/skills');
		expect(result.files.map(file => file.path)).toEqual([
			'plugins/ataraxia-skills/.codex-plugin/plugin.json',
			'plugins/ataraxia-skills/skills/obsidian-cli/SKILL.md',
		]);
		expect(result.files[0]?.content).toContain('"skills": "./skills/"');
		expect(result.files[0]?.content).toContain('"name": "ataraxia-skills"');
	});

	it('packages Codex skills into an extra nested publish group when provided', async () => {
		const settings = makeSettings({
			targetProvider: 'codex-plugin',
			codexPluginPath: 'plugins/ataraxia-skills',
			codexPluginName: 'ataraxia-skills',
		});
		const folders = [makeFolder('obsidian-cli', { publishGroup: 'dev' })];

		const result = await buildPackagingResult(settings, folders, { readVaultFileByPath: async () => null } as never);
		expect(result.files.map(file => file.path)).toEqual([
			'plugins/ataraxia-skills/.codex-plugin/plugin.json',
			'plugins/ataraxia-skills/skills/dev/obsidian-cli/SKILL.md',
		]);
	});
});
