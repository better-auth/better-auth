import { getWebcryptoSubtle } from "@better-auth/utils";
import { createHash } from "@better-auth/utils/hash";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
	bytesToHex,
	hexToBytes,
	managedNonce,
	utf8ToBytes,
} from "@noble/ciphers/utils.js";

const algorithm = { name: "HMAC", hash: "SHA-256" };

export type { SecretConfig } from "@better-auth/core";

const ENVELOPE_PREFIX = "$ba$";

export function parseEnvelope(
	data: string,
): { version: number; ciphertext: string } | null {
	if (!data.startsWith(ENVELOPE_PREFIX)) return null;
	const firstSep = ENVELOPE_PREFIX.length;
	const secondSep = data.indexOf("$", firstSep);
	if (secondSep === -1) return null;
	const version = parseInt(data.slice(firstSep, secondSep), 10);
	if (!Number.isInteger(version) || version < 0) return null;
	const ciphertext = data.slice(secondSep + 1);
	return { version, ciphertext };
}

export function formatEnvelope(version: number, ciphertext: string): string {
	return `${ENVELOPE_PREFIX}${version}$${ciphertext}`;
}

export type SymmetricEncryptOptions = {
	key: string | SecretConfig;
	data: string;
};

export const symmetricEncrypt = async ({
	key,
	data,
}: SymmetricEncryptOptions) => {
	if (typeof key === "string") {
		const keyAsBytes = await createHash("SHA-256").digest(key);
		const dataAsBytes = utf8ToBytes(data);
		const chacha = managedNonce(xchacha20poly1305)(
			new Uint8Array(keyAsBytes),
		);
		return bytesToHex(chacha.encrypt(dataAsBytes));
	}
	const secret = key.keys.get(key.currentVersion);
	if (!secret) {
		throw new Error(
			`Secret version ${key.currentVersion} not found in keys`,
		);
	}
	const keyAsBytes = await createHash("SHA-256").digest(secret);
	const dataAsBytes = utf8ToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	const ciphertext = bytesToHex(chacha.encrypt(dataAsBytes));
	return formatEnvelope(key.currentVersion, ciphertext);
};

export type SymmetricDecryptOptions = {
	key: string | SecretConfig;
	data: string;
};

export const symmetricDecrypt = async ({
	key,
	data,
}: SymmetricDecryptOptions) => {
	if (typeof key === "string") {
		const keyAsBytes = await createHash("SHA-256").digest(key);
		const dataAsBytes = hexToBytes(data);
		const chacha = managedNonce(xchacha20poly1305)(
			new Uint8Array(keyAsBytes),
		);
		return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
	}
	const envelope = parseEnvelope(data);
	if (envelope) {
		const secret = key.keys.get(envelope.version);
		if (!secret) {
			throw new Error(
				`Secret version ${envelope.version} not found in keys (key may have been retired)`,
			);
		}
		const keyAsBytes = await createHash("SHA-256").digest(secret);
		const dataAsBytes = hexToBytes(envelope.ciphertext);
		const chacha = managedNonce(xchacha20poly1305)(
			new Uint8Array(keyAsBytes),
		);
		return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
	}
	// Legacy bare-hex payload
	if (key.legacySecret) {
		const keyAsBytes = await createHash("SHA-256").digest(key.legacySecret);
		const dataAsBytes = hexToBytes(data);
		const chacha = managedNonce(xchacha20poly1305)(
			new Uint8Array(keyAsBytes),
		);
		return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
	}
	throw new Error(
		"Cannot decrypt legacy bare-hex payload: no legacy secret available. Set BETTER_AUTH_SECRET for backwards compatibility.",
	);
};

export const getCryptoKey = async (secret: string | BufferSource) => {
	const secretBuf =
		typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
	return await getWebcryptoSubtle().importKey(
		"raw",
		secretBuf,
		algorithm,
		false,
		["sign", "verify"],
	);
};

export const makeSignature = async (
	value: string,
	secret: string | BufferSource,
): Promise<string> => {
	const key = await getCryptoKey(secret);
	const signature = await getWebcryptoSubtle().sign(
		algorithm.name,
		key,
		new TextEncoder().encode(value),
	);
	// the returned base64 encoded signature will always be 44 characters long and end with one or two equal signs
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

export * from "./buffer";
export * from "./jwt";
export * from "./password";
export * from "./random";
