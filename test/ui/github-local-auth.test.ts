import { describe, expect, it } from 'vitest';
import { GitHubLocalAuth, type RunCommand } from '../../src/ui/github-local-auth';

describe('GitHubLocalAuth', () => {
	it('reports missing git and gh as blockers', async () => {
		const auth = new GitHubLocalAuth(() => ({
			status: 1,
			stdout: '',
			stderr: '',
		}));

		const state = await auth.readState();
		expect(state.gitInstalled).toBe(false);
		expect(state.ghInstalled).toBe(false);
		expect(state.localCredentialAvailable).toBe(false);
		expect(state.blockedReasons).toContain('Install git to enable local GitHub credential reuse.');
		expect(state.blockedReasons).toContain('Install GitHub CLI (`gh`) to reuse an existing GitHub login.');
	});

	it('reports gh login requirement when gh is installed but not authenticated', async () => {
		const runCommand: RunCommand = (command, args) => {
			if (command === 'git') return { status: 0, stdout: 'git version 2.49.0', stderr: '' };
			if (command === 'gh' && args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
			if (command === 'gh' && args[0] === 'auth' && args[1] === 'status') {
				return { status: 1, stdout: '', stderr: 'not logged in' };
			}
			return { status: 1, stdout: '', stderr: '' };
		};

		const state = await new GitHubLocalAuth(runCommand).readState();
		expect(state.localCredentialAvailable).toBe(false);
		expect(state.blockedReasons).toContain('Run `gh auth login` to enable local GitHub credential reuse.');
	});

	it('returns reusable local credentials when git and gh auth are available', async () => {
		const runCommand: RunCommand = (command, args) => {
			if (command === 'git') return { status: 0, stdout: 'git version 2.49.0', stderr: '' };
			if (command === 'gh' && args[0] === '--version') return { status: 0, stdout: 'gh version 2.0.0', stderr: '' };
			if (command === 'gh' && args[0] === 'auth' && args[1] === 'status') {
				return {
					status: 0,
					stdout: '',
					stderr: '✓ Logged in to github.com account GoBeromsu (/Users/test/.config/gh/hosts.yml)',
				};
			}
			if (command === 'gh' && args[0] === 'auth' && args[1] === 'token') {
				return { status: 0, stdout: 'gho_local_token\n', stderr: '' };
			}
			return { status: 1, stdout: '', stderr: '' };
		};

		const state = await new GitHubLocalAuth(runCommand).readState();
		expect(state.localCredentialAvailable).toBe(true);
		expect(state.username).toBe('GoBeromsu');
		expect(state.token).toBe('gho_local_token');
	});
});
