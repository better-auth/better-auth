import type { SecretConfig } from "@better-auth/core";
import { getWebcryptoSubtle } from "@better-auth/utils";
import { createHash } from "@better-auth/utils/hash";
import { createHMAC } from "@better-auth/utils/hmac";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
	bytesToHex,
	hexToBytes,
	managedNonce,
	utf8ToBytes,
} from "@noble/ciphers/utils.js";

export type { SecretConfig };

const algorithm = { name: "HMAC", hash: "SHA-256" };

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

async function rawEncrypt(secret: string, data: string): Promise<string> {
	const keyAsBytes = await createHash("SHA-256").digest(secret);
	const dataAsBytes = utf8ToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return bytesToHex(chacha.encrypt(dataAsBytes));
}

async function rawDecrypt(secret: string, hex: string): Promise<string> {
	const keyAsBytes = await createHash("SHA-256").digest(secret);
	const dataAsBytes = hexToBytes(hex);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
}

export const symmetricEncrypt = async ({
	key,
	data,
}: SymmetricEncryptOptions) => {
	if (typeof key === "string") {
		return rawEncrypt(key, data);
	}
	const secret = key.keys.get(key.currentVersion);
	if (!secret) {
		throw new Error(`Secret version ${key.currentVersion} not found in keys`);
	}
	const ciphertext = await rawEncrypt(secret, data);
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
		return rawDecrypt(key, data);
	}
	const envelope = parseEnvelope(data);
	if (envelope) {
		const secret = key.keys.get(envelope.version);
		if (!secret) {
			throw new Error(
				`Secret version ${envelope.version} not found in keys (key may have been retired)`,
			);
		}
		return rawDecrypt(secret, envelope.ciphertext);
	}
	// Legacy bare-hex payload
	if (key.legacySecret) {
		return rawDecrypt(key.legacySecret, data);
	}
	throw new Error(
		"Cannot decrypt legacy bare-hex payload: no legacy secret available. Set BETTER_AUTH_SECRET for backwards compatibility.",
	);
};

const MAX_HMAC_KEY_CACHE_SIZE = 64;
const hmacKeyCache = new WeakMap<object, Map<string, Promise<CryptoKey>>>();
const textEncoder = new TextEncoder();
const hmacSha256Base64Url = createHMAC("SHA-256", "base64urlnopad");

export const getCryptoKey = async (secret: string | BufferSource) => {
	const subtle = getWebcryptoSubtle();
	if (typeof secret !== "string") {
		return await subtle.importKey("raw", secret, algorithm, false, [
			"sign",
			"verify",
		]);
	}
	let secretCache = hmacKeyCache.get(subtle);
	if (!secretCache) {
		secretCache = new Map();
		hmacKeyCache.set(subtle, secretCache);
	}
	const cached = secretCache.get(secret);
	if (cached) {
		// Refresh insertion order for simple LRU eviction.
		secretCache.delete(secret);
		secretCache.set(secret, cached);
		return await cached;
	}
	if (secretCache.size >= MAX_HMAC_KEY_CACHE_SIZE) {
		const oldestKey = secretCache.keys().next().value;
		if (oldestKey !== undefined) {
			secretCache.delete(oldestKey);
		}
	}
	const keyPromise = Promise.resolve()
		.then(() =>
			subtle.importKey(
				"raw",
				textEncoder.encode(secret),
				algorithm,
				false,
				["sign", "verify"],
			),
		)
		.catch((err) => {
			if (secretCache.get(secret) === keyPromise) {
				secretCache.delete(secret);
			}
			throw err;
		});
	secretCache.set(secret, keyPromise);
	return await keyPromise;
};

/**
 * Sign `data` using HMAC-SHA256 encoded as unpadded base64url, reusing the
 * cached CryptoKey for `secret`.
 */
export const signHmacSha256 = async (
	secret: string,
	data: string,
): Promise<string> => {
	const key = await getCryptoKey(secret);
	return await hmacSha256Base64Url.sign(key, data);
};

/**
 * Verify an unpadded base64url HMAC-SHA256 `signature` for `data`, reusing the
 * cached CryptoKey for `secret`.
 */
export const verifyHmacSha256 = async (
	secret: string,
	data: string,
	signature: string,
): Promise<boolean> => {
	const key = await getCryptoKey(secret);
	return await hmacSha256Base64Url.verify(key, data, signature);
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
