import type { TokenStore } from '../types/token-store';
import type { GitHubConnectionState, StoredAccessToken } from '../types/settings';
import type { PluginLogger } from '../shared/plugin-logger';
import type { GitHubApiClient } from './github-api';
import { GitHubLocalAuth, toDeployBlockedReasons } from './github-local-auth';

export class GitHubAuth {
	constructor(
		private readonly tokenStore: TokenStore,
		private readonly githubApi: GitHubApiClient,
		private readonly logger: PluginLogger,
		private readonly localAuth: GitHubLocalAuth = new GitHubLocalAuth(),
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
		return (await this.getConnectionState()).authSource !== 'none';
	}

	async getToken(): Promise<string | null> {
		const storedToken = await this.tokenStore.load();
		if (storedToken) return storedToken.token;

		const localState = await this.localAuth.readState();
		return localState.localCredentialAvailable ? localState.token : null;
	}

	async getUsername(): Promise<string | null> {
		const storedToken = await this.tokenStore.load();
		if (storedToken) return storedToken.username;

		const localState = await this.localAuth.readState();
		return localState.username;
	}

	async getConnectionState(): Promise<GitHubConnectionState> {
		const storedToken = await this.tokenStore.load();
		const localState = await this.localAuth.readState();
		const tokenFallbackAvailable = storedToken !== null;
		const authSource = storedToken
			? 'stored-token'
			: localState.localCredentialAvailable
				? 'local-gh'
				: 'none';

		return {
			gitInstalled: localState.gitInstalled,
			ghInstalled: localState.ghInstalled,
			localCredentialAvailable: localState.localCredentialAvailable,
			tokenFallbackAvailable,
			authSource,
			username: storedToken?.username ?? localState.username,
			localBlockedReasons: localState.blockedReasons,
			deployBlockedReasons: toDeployBlockedReasons(localState, tokenFallbackAvailable),
		};
	}

	async logout(): Promise<void> {
		await this.tokenStore.clear();
		this.logger.info('Cleared stored token fallback');
	}
}
