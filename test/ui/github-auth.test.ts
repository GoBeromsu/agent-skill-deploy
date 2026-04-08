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

		const auth = new GitHubAuth(tokenStore, githubApi as never, logger as never);
		const stored = await auth.setToken('  github_pat_123  ');

		expect(githubApi.getUser).toHaveBeenCalledWith('github_pat_123');
		expect(save).toHaveBeenCalledWith(expect.objectContaining({
			token: 'github_pat_123',
			username: 'beomsu',
		}));
		expect(stored.username).toBe('beomsu');
	});
});
