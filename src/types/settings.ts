export type DeployTargetProvider = 'claude-marketplace' | 'codex-plugin';

export interface SkillDeploySettings {
	sourceRootPath: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	managedSetupApprovedAt: string | null;
	targetProvider: DeployTargetProvider;
	managedSkillsPath: string;
	codexPluginPath: string;
	codexPluginName: string;
	deployState: DeployStateEntry | null;
	plugin_notices?: { muted: Record<string, boolean> };
}

export interface StoredAccessToken {
	token: string;
	username: string;
	validatedAt: string;
}

export interface DeployStateEntry {
	lastRemoteTreeSha: string | null;
	lastDeployedAt: string;
	commitSha: string;
}

export type GitHubAuthSource = 'stored-token' | 'local-gh' | 'none';

export interface GitHubConnectionState {
	gitInstalled: boolean;
	ghInstalled: boolean;
	localCredentialAvailable: boolean;
	tokenFallbackAvailable: boolean;
	authSource: GitHubAuthSource;
	username: string | null;
	localBlockedReasons: string[];
	deployBlockedReasons: string[];
}
