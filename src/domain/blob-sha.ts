import { Buffer } from 'buffer';
import { createHash } from 'crypto';
import type { DeployableFile } from '../types/skill';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function encodeVaultFile(bytes: Uint8Array): Pick<DeployableFile, 'content' | 'encoding' | 'blobSha' | 'size'> {
	const content = tryDecodeUtf8(bytes);
	const encoding = content === null ? 'base64' : 'utf-8';

	return {
		content: content ?? Buffer.from(bytes).toString('base64'),
		encoding,
		blobSha: createGitBlobSha(bytes),
		size: bytes.byteLength,
	};
}

export function createGitBlobSha(bytes: Uint8Array): string {
	const header = Buffer.from(`blob ${bytes.byteLength}\0`, 'utf-8');
	return createHash('sha1')
		.update(header)
		.update(Buffer.from(bytes))
		.digest('hex');
}

export function createSnapshotHash(files: readonly Pick<DeployableFile, 'relativePath' | 'blobSha'>[]): string {
	const payload = files
		.slice()
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
		.map(file => `${file.relativePath}:${file.blobSha}`)
		.join('\n');

	return createHash('sha1').update(payload, 'utf-8').digest('hex');
}

function tryDecodeUtf8(bytes: Uint8Array): string | null {
	try {
		return UTF8_DECODER.decode(bytes);
	} catch {
		return null;
	}
}
