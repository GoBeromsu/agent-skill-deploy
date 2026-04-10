#!/usr/bin/env node
import fs from 'node:fs';

export function readReleaseMetadata(
	packageJsonPath = 'package.json',
	manifestPath = 'manifest.json',
) {
	const packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
	const manifestVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
	return { packageVersion, manifestVersion };
}

export function normalizeReleaseTag(tag) {
	if (typeof tag !== 'string') return null;
	const normalized = tag.trim();
	if (normalized === '') return null;
	return normalized.startsWith('v') ? normalized.slice(1) : normalized;
}

export function validateReleaseMetadata({
	tag,
	packageVersion,
	manifestVersion,
}) {
	if (packageVersion !== manifestVersion) {
		throw new Error(`package.json version ${packageVersion} does not match manifest.json version ${manifestVersion}`);
	}

	const normalizedTag = normalizeReleaseTag(tag);
	if (normalizedTag && normalizedTag !== packageVersion) {
		throw new Error(`Tag ${tag} does not match package.json version ${packageVersion}`);
	}
}
