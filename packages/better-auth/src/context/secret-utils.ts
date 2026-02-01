import type { SecretConfig } from "@better-auth/core";
import type { createLogger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";

/**
 * Estimates the entropy of a string in bits.
 * This is a simple approximation that helps detect low-entropy secrets.
 */
function estimateEntropy(str: string): number {
	const unique = new Set(str).size;
	if (unique === 0) return 0;
	return Math.log2(Math.pow(unique, str.length));
}

export function parseSecretsEnv(
	envValue: string | undefined,
): Array<{ version: number; value: string }> | null {
	if (!envValue) return null;
	const entries = envValue.split(",").map((entry) => {
		entry = entry.trim();
		const colonIdx = entry.indexOf(":");
		if (colonIdx === -1) {
			throw new BetterAuthError(
				`Invalid BETTER_AUTH_SECRETS entry: "${entry}". Expected format: "<version>:<secret>"`,
			);
		}
		const version = parseInt(entry.slice(0, colonIdx), 10);
		if (!Number.isInteger(version) || version < 0) {
			throw new BetterAuthError(
				`Invalid version in BETTER_AUTH_SECRETS: "${entry.slice(0, colonIdx)}". Version must be a non-negative integer.`,
			);
		}
		const value = entry.slice(colonIdx + 1).trim();
		if (!value) {
			throw new BetterAuthError(
				`Empty secret value for version ${version} in BETTER_AUTH_SECRETS.`,
			);
		}
		return { version, value };
	});
	return entries;
}

export function validateSecretsArray(
	secrets: Array<{ version: number; value: string }>,
	logger: ReturnType<typeof createLogger>,
): void {
	if (secrets.length === 0) {
		throw new BetterAuthError(
			"`secrets` array must contain at least one entry.",
		);
	}
	const seen = new Set<number>();
	for (const s of secrets) {
		const version = Number(s.version);
		if (!Number.isInteger(version) || version < 0) {
			throw new BetterAuthError(
				`Invalid version ${s.version} in \`secrets\`. Version must be a non-negative integer.`,
			);
		}
		if (!s.value) {
			throw new BetterAuthError(
				`Empty secret value for version ${s.version} in \`secrets\`.`,
			);
		}
		if (seen.has(version)) {
			throw new BetterAuthError(
				`Duplicate version ${version} in \`secrets\`. Each version must be unique.`,
			);
		}
		seen.add(version);
		s.version = version;
	}
	const current = secrets[0];
	if (current.value.length < 32) {
		logger.warn(
			`[better-auth] Warning: the current secret (version ${current.version}) should be at least 32 characters long for adequate security.`,
		);
	}
	const entropy = estimateEntropy(current.value);
	if (entropy < 120) {
		logger.warn(
			"[better-auth] Warning: the current secret appears low-entropy. Use a randomly generated secret for production.",
		);
	}
}

export function buildSecretConfig(
	secrets: Array<{ version: number; value: string }>,
	legacySecret: string,
): SecretConfig {
	const keys = new Map<number, string>();
	for (const s of secrets) {
		keys.set(s.version, s.value);
	}
	const DEFAULT_SECRET = "better_auth_secret_at_least_32_characters_long";
	return {
		keys,
		currentVersion: secrets[0].version,
		legacySecret:
			legacySecret && legacySecret !== DEFAULT_SECRET
				? legacySecret
				: undefined,
	};
}
