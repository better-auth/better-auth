import type { SecretConfig } from "@better-auth/core";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type EncryptionPurpose =
	| "oauth-state-cookie"
	| "oauth-proxy-state"
	| "oauth-proxy-package"
	| "oauth-proxy-profile";

const salt = utf8ToBytes("better-auth:oauth-encryption:v1");

function deriveSecret(secret: string, purpose: EncryptionPurpose): string {
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

/** Derive an isolated key for one OAuth ciphertext purpose, retaining rotation versions. */
export function derivePurposeKey(
	secret: string | SecretConfig,
	purpose: EncryptionPurpose,
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
