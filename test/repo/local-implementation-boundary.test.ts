import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = join(repoRoot, 'src');

function readRepoFile(...segments: string[]): string {
	return readFileSync(join(repoRoot, ...segments), 'utf8');
}

function listSourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) return listSourceFiles(fullPath);
		return entry.isFile() ? [fullPath] : [];
	});
}

describe('repo-local implementation boundary', () => {
	it('keeps runtime source ownership local to this repo', () => {
		const sourceFiles = listSourceFiles(sourceRoot)
			.filter(file => file.endsWith('.ts') || file.endsWith('.css'));
		for (const file of sourceFiles) {
			const content = readFileSync(file, 'utf8');
			expect(content).not.toContain('Synced from obsidian-boiler-template/tooling/shared/src-shared');
		}
	});

	it('does not keep unused shared-runtime carryovers around', () => {
		expect(existsSync(join(repoRoot, 'src/shared/settings-migration.ts'))).toBe(false);
		expect(existsSync(join(repoRoot, 'src/shared/styles.base.css'))).toBe(false);
	});

	it('does not compile boiler-template runtime paths into the repo tsconfig', () => {
		const tsconfig = readRepoFile('tsconfig.json');
		expect(tsconfig).not.toContain('tooling/shared/src-shared/**/*.ts');
	});
});
