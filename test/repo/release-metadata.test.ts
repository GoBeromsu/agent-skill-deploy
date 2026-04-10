import { describe, expect, it } from 'vitest';
import { normalizeReleaseTag, validateReleaseMetadata } from '../../scripts/release-metadata.mjs';

describe('release metadata validation', () => {
	it('normalizes npm-style v-prefixed tags', () => {
		expect(normalizeReleaseTag('v0.1.2')).toBe('0.1.2');
		expect(normalizeReleaseTag('0.1.2')).toBe('0.1.2');
	});

	it('accepts matching plain and v-prefixed tags', () => {
		expect(() => validateReleaseMetadata({
			tag: '0.1.2',
			packageVersion: '0.1.2',
			manifestVersion: '0.1.2',
		})).not.toThrow();

		expect(() => validateReleaseMetadata({
			tag: 'v0.1.2',
			packageVersion: '0.1.2',
			manifestVersion: '0.1.2',
		})).not.toThrow();
	});

	it('rejects tag/version mismatches', () => {
		expect(() => validateReleaseMetadata({
			tag: 'v0.1.3',
			packageVersion: '0.1.2',
			manifestVersion: '0.1.2',
		})).toThrow('Tag v0.1.3 does not match package.json version 0.1.2');
	});

	it('rejects package/manifest mismatches', () => {
		expect(() => validateReleaseMetadata({
			tag: 'v0.1.2',
			packageVersion: '0.1.2',
			manifestVersion: '0.1.1',
		})).toThrow('package.json version 0.1.2 does not match manifest.json version 0.1.1');
	});
});
