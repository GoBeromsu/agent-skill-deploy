import { describe, it, expect } from 'vitest';
import { discoverDeployableFolders } from '../../src/domain/skill-discovery';
import type { VaultFolderListing } from '../../src/types/skill';

describe('discoverDeployableFolders', () => {
	it('discovers root-note folders via folder-name note + plugin_id', () => {
		const folders: VaultFolderListing[] = [
			{
				folderPath: '55. Tools/Skills/obsidian-cli',
				folderName: 'obsidian-cli',
				files: [
					{
						name: 'obsidian-cli.md',
						path: '55. Tools/Skills/obsidian-cli/obsidian-cli.md',
						frontmatter: { plugin_id: 'obsidian-cli' },
					},
				],
			},
		];

		const result = discoverDeployableFolders(folders);
		expect(result.warnings).toEqual([]);
		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]).toMatchObject({
			folderName: 'obsidian-cli',
			identityMode: 'root-note',
			pluginId: 'obsidian-cli',
			rootNotePath: '55. Tools/Skills/obsidian-cli/obsidian-cli.md',
			publishGroup: null,
		});
	});

	it('captures optional publish_group from the root note frontmatter', () => {
		const folders: VaultFolderListing[] = [
			{
				folderPath: '55. Tools/Skills/obsidian-cli',
				folderName: 'obsidian-cli',
				files: [
					{
						name: 'obsidian-cli.md',
						path: '55. Tools/Skills/obsidian-cli/obsidian-cli.md',
						frontmatter: { plugin_id: 'obsidian-cli', publish_group: 'dev' },
					},
				],
			},
		];

		const result = discoverDeployableFolders(folders);
		expect(result.folders[0]).toMatchObject({
			pluginId: 'obsidian-cli',
			publishGroup: 'dev',
		});
	});

	it('falls back to legacy SKILL.md folders', () => {
		const folders: VaultFolderListing[] = [
			{
				folderPath: '55. Tools/Skills/legacy-skill',
				folderName: 'legacy-skill',
				files: [
					{ name: 'SKILL.md', path: '55. Tools/Skills/legacy-skill/SKILL.md' },
				],
			},
		];

		const result = discoverDeployableFolders(folders);
		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]).toMatchObject({
			folderName: 'legacy-skill',
			identityMode: 'legacy-skill-md',
			pluginId: 'legacy-skill',
			rootNotePath: null,
			publishGroup: null,
		});
	});

	it('prefers root-note identity when both root note and SKILL.md exist', () => {
		const folders: VaultFolderListing[] = [
			{
				folderPath: '55. Tools/Skills/fyc',
				folderName: 'fyc',
				files: [
					{ name: 'SKILL.md', path: '55. Tools/Skills/fyc/SKILL.md' },
					{ name: 'fyc.md', path: '55. Tools/Skills/fyc/fyc.md', frontmatter: { plugin_id: 'fyc' } },
				],
			},
		];

		const result = discoverDeployableFolders(folders);
		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]?.identityMode).toBe('root-note');
	});

	it('skips misplaced plugin_id notes and emits a warning', () => {
		const folders: VaultFolderListing[] = [
			{
				folderPath: '55. Tools/Skills/misnamed',
				folderName: 'misnamed',
				files: [
					{
						name: 'README.md',
						path: '55. Tools/Skills/misnamed/README.md',
						frontmatter: { plugin_id: 'wrong-place' },
					},
				],
			},
		];

		const result = discoverDeployableFolders(folders);
		expect(result.folders).toHaveLength(0);
		expect(result.warnings[0]).toContain('misnamed.md');
	});

	it('does not register nested children below an already deployable folder', () => {
		const folders: VaultFolderListing[] = [
			{
				folderPath: '55. Tools/Skills/parent',
				folderName: 'parent',
				files: [
					{ name: 'parent.md', path: '55. Tools/Skills/parent/parent.md', frontmatter: { plugin_id: 'parent' } },
				],
			},
			{
				folderPath: '55. Tools/Skills/parent/child',
				folderName: 'child',
				files: [
					{ name: 'child.md', path: '55. Tools/Skills/parent/child/child.md', frontmatter: { plugin_id: 'child' } },
				],
			},
		];

		const result = discoverDeployableFolders(folders);
		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]?.folderName).toBe('parent');
	});
});
