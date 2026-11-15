import type { SecretConfig } from "@better-auth/core";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

// Keys for released purposes depend on this exact salt, whatever the purpose.
const salt = utf8ToBytes("better-auth:oauth-encryption:v1");

function deriveSecret(secret: string, purpose: string): string {
	return bytesToHex(
		hkdf(
			sha256,
			utf8ToBytes(secret),
			salt,
			utf8ToBytes(`better-auth:${purpose}:v1`),
			32,
		),
	);
}

/**
 * Derives an encryption key for one purpose from the Better Auth secret, so a
 * ciphertext made for one purpose does not decrypt as another. Pass the result
 * as `key` to `symmetricEncrypt` and `symmetricDecrypt`. A versioned secret
 * keeps each version, so ciphertexts made before a rotation still decrypt.
 *
 * @param secret - The Better Auth secret, usually `ctx.context.secretConfig`.
 * @param purpose - A label unique to what the key encrypts, such as
 * `"my-plugin:session-hint"`.
 */
export function deriveEncryptionKey(
	secret: string | SecretConfig,
	purpose: string,
): string | SecretConfig {
	if (typeof secret === "string") {
		return deriveSecret(secret, purpose);
	}
	return {
		keys: new Map(
			Array.from(secret.keys, ([version, value]) => [
				version,
				deriveSecret(value, purpose),
			]),
		),
		currentVersion: secret.currentVersion,
		...(secret.legacySecret && {
			legacySecret: deriveSecret(secret.legacySecret, purpose),
		}),
	};
}
