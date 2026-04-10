import type { GitHubConnectionState } from '../types/settings';

interface CommandResult {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
}

export type RunCommand = (command: string, args: string[]) => CommandResult;

export interface LocalGitHubCredentialState {
	gitInstalled: boolean;
	ghInstalled: boolean;
	localCredentialAvailable: boolean;
	username: string | null;
	token: string | null;
	blockedReasons: string[];
}

export class GitHubLocalAuth {
	constructor(private readonly runCommand: RunCommand = defaultRunCommand) {}

	readState(): Promise<LocalGitHubCredentialState> {
		const gitInstalled = isSuccessful(this.runCommand('git', ['--version']));
		const ghInstalled = isSuccessful(this.runCommand('gh', ['--version']));
		const blockedReasons: string[] = [];

		if (!gitInstalled) blockedReasons.push('Install git to enable local GitHub credential reuse.');
		if (!ghInstalled) blockedReasons.push('Install GitHub CLI (`gh`) to reuse an existing GitHub login.');
		if (!gitInstalled || !ghInstalled) {
			return Promise.resolve({
				gitInstalled,
				ghInstalled,
				localCredentialAvailable: false,
				username: null,
				token: null,
				blockedReasons,
			});
		}

		const statusResult = this.runCommand('gh', ['auth', 'status']);
		const statusOutput = [statusResult.stdout, statusResult.stderr].filter(Boolean).join('\n');
		if (!isSuccessful(statusResult)) {
			blockedReasons.push('Run `gh auth login` to enable local GitHub credential reuse.');
			return Promise.resolve({
				gitInstalled,
				ghInstalled,
				localCredentialAvailable: false,
				username: null,
				token: null,
				blockedReasons,
			});
		}

		const tokenResult = this.runCommand('gh', ['auth', 'token']);
		const token = isSuccessful(tokenResult) ? tokenResult.stdout.trim() : '';
		if (token === '') {
			blockedReasons.push('GitHub CLI is authenticated but could not provide a reusable token.');
			return Promise.resolve({
				gitInstalled,
				ghInstalled,
				localCredentialAvailable: false,
				username: parseGitHubUsername(statusOutput),
				token: null,
				blockedReasons,
			});
		}

		return Promise.resolve({
			gitInstalled,
			ghInstalled,
			localCredentialAvailable: true,
			username: parseGitHubUsername(statusOutput),
			token,
			blockedReasons,
		});
	}
}

export function toDeployBlockedReasons(state: LocalGitHubCredentialState, tokenFallbackAvailable: boolean): GitHubConnectionState['deployBlockedReasons'] {
	if (state.localCredentialAvailable || tokenFallbackAvailable) return [];
	return [
		...state.blockedReasons,
		'Configure a GitHub token fallback to deploy when local credential reuse is unavailable.',
	];
}

function defaultRunCommand(command: string, args: string[]): CommandResult {
	// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- child_process must be loaded via require() in Obsidian's Node context
	const { spawnSync } = require('child_process') as {
		spawnSync: (command: string, args: string[], options: { encoding: 'utf8' }) => {
			status: number | null;
			stdout?: string;
			stderr?: string;
			error?: Error;
		};
	};
	const result = spawnSync(command, args, { encoding: 'utf8' });
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		error: result.error,
	};
}

function isSuccessful(result: CommandResult): boolean {
	return result.error === undefined && (result.status ?? 1) === 0;
}

function parseGitHubUsername(output: string): string | null {
	const matched = output.match(/account\s+([^\s]+)\s+\(/i);
	if (!matched?.[1]) return null;
	return matched[1];
}
