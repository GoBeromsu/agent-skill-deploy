import type { StoredAccessToken } from './settings';

export interface TokenStore {
	save(tokens: StoredAccessToken): Promise<void>;
	load(): Promise<StoredAccessToken | null>;
	clear(): Promise<void>;
}
