import { describe, expect, it, vi } from 'vitest';
import { GitHubAuth } from '../../src/ui/github-auth';
import type { StoredAccessToken } from '../../src/types/settings';

describe('GitHubAuth', () => {
	it('validates and stores a PAT', async () => {
		const save = vi.fn<(token: StoredAccessToken) => Promise<void>>().mockResolvedValue(undefined);
		const tokenStore = {
			save,
			load: vi.fn().mockResolvedValue(null),
			clear: vi.fn().mockResolvedValue(undefined),
		};
		const githubApi = {
			getUser: vi.fn().mockResolvedValue('beomsu'),
		};
		const logger = {
			info: vi.fn(),
		};

		const localAuth = {
			readState: vi.fn().mockResolvedValue({
				gitInstalled: true,
				ghInstalled: true,
				localCredentialAvailable: false,
				username: null,
				token: null,
				blockedReasons: ['Run `gh auth login` to enable local GitHub credential reuse.'],
			}),
		};

		const auth = new GitHubAuth(tokenStore, githubApi as never, logger as never, localAuth as never);
		const stored = await auth.setToken('  github_pat_123  ');

		expect(githubApi.getUser).toHaveBeenCalledWith('github_pat_123');
		expect(save).toHaveBeenCalledWith(expect.objectContaining({
			token: 'github_pat_123',
			username: 'beomsu',
		}));
		expect(stored.username).toBe('beomsu');
	});

	it('prefers stored token fallback over local credentials', async () => {
		const tokenStore = {
			save: vi.fn(),
			load: vi.fn().mockResolvedValue({
				token: 'stored-token',
				username: 'stored-user',
				validatedAt: '2026-04-10T00:00:00.000Z',
			}),
			clear: vi.fn().mockResolvedValue(undefined),
		};
		const localAuth = {
			readState: vi.fn().mockResolvedValue({
				gitInstalled: true,
				ghInstalled: true,
				localCredentialAvailable: true,
				username: 'local-user',
				token: 'local-token',
				blockedReasons: [],
			}),
		};

		const auth = new GitHubAuth(tokenStore as never, {} as never, { info: vi.fn() } as never, localAuth as never);
		const connection = await auth.getConnectionState();

		expect(connection.authSource).toBe('stored-token');
		expect(connection.tokenFallbackAvailable).toBe(true);
		expect(await auth.getToken()).toBe('stored-token');
		expect(await auth.getUsername()).toBe('stored-user');
	});

	it('uses reusable local GitHub credentials when no stored token exists', async () => {
		const tokenStore = {
			save: vi.fn(),
			load: vi.fn().mockResolvedValue(null),
			clear: vi.fn().mockResolvedValue(undefined),
		};
		const localAuth = {
			readState: vi.fn().mockResolvedValue({
				gitInstalled: true,
				ghInstalled: true,
				localCredentialAvailable: true,
				username: 'local-user',
				token: 'local-token',
				blockedReasons: [],
			}),
		};

		const auth = new GitHubAuth(tokenStore as never, {} as never, { info: vi.fn() } as never, localAuth as never);
		const connection = await auth.getConnectionState();

		expect(connection.authSource).toBe('local-gh');
		expect(connection.deployBlockedReasons).toEqual([]);
		expect(await auth.getToken()).toBe('local-token');
		expect(await auth.getUsername()).toBe('local-user');
	});

	it('reports deploy blockers when neither local reuse nor token fallback is available', async () => {
		const tokenStore = {
			save: vi.fn(),
			load: vi.fn().mockResolvedValue(null),
			clear: vi.fn().mockResolvedValue(undefined),
		};
		const localAuth = {
			readState: vi.fn().mockResolvedValue({
				gitInstalled: false,
				ghInstalled: false,
				localCredentialAvailable: false,
				username: null,
				token: null,
				blockedReasons: ['Install git to enable local GitHub credential reuse.'],
			}),
		};

		const auth = new GitHubAuth(tokenStore as never, {} as never, { info: vi.fn() } as never, localAuth as never);
		const connection = await auth.getConnectionState();

		expect(connection.authSource).toBe('none');
		expect(connection.deployBlockedReasons).toContain('Configure a GitHub token fallback to deploy when local credential reuse is unavailable.');
	});
});
