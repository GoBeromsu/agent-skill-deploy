import type { TokenStore } from '../types/token-store';
import type { StoredAccessToken } from '../types/settings';
import type { PluginLogger } from '../shared/plugin-logger';
import type { GitHubApiClient } from './github-api';

export class GitHubAuth {
	constructor(
		private readonly tokenStore: TokenStore,
		private readonly githubApi: GitHubApiClient,
		private readonly logger: PluginLogger,
	) {}

	async setToken(token: string): Promise<StoredAccessToken> {
		const normalized = token.trim();
		if (normalized === '') {
			throw new Error('GitHub personal access token is required');
		}

		const username = await this.githubApi.getUser(normalized);
		const storedToken: StoredAccessToken = {
			token: normalized,
			username,
			validatedAt: new Date().toISOString(),
		};
		await this.tokenStore.save(storedToken);
		this.logger.info('Stored GitHub PAT', { username });
		return storedToken;
	}

	async isAuthenticated(): Promise<boolean> {
		const tokens = await this.tokenStore.load();
		return tokens !== null;
	}

	async getToken(): Promise<string | null> {
		return (await this.tokenStore.load())?.token ?? null;
	}

	async getUsername(): Promise<string | null> {
		const tokens = await this.tokenStore.load();
		return tokens?.username ?? null;
	}

	async logout(): Promise<void> {
		await this.tokenStore.clear();
		this.logger.info('Logged out');
	}
}
