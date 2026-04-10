#!/usr/bin/env node
import { readReleaseMetadata, validateReleaseMetadata } from './release-metadata.mjs';

const tagArg = process.argv
	.find(arg => arg.startsWith('--tag='))
	?.slice('--tag='.length);

const tag = tagArg ?? process.env.GITHUB_REF_NAME ?? null;
const { packageVersion, manifestVersion } = readReleaseMetadata();

try {
	validateReleaseMetadata({ tag, packageVersion, manifestVersion });
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
}
