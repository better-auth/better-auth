import type { SecretConfig } from "../types/secret";

/**
 * Returns secret values for verification, current first then priors (and legacy).
 * Signing / encrypting should keep using only the current secret.
 */
export function getSecretValues(secret: string | SecretConfig): string[] {
	if (typeof secret === "string") {
		return [secret];
	}
	const values: string[] = [];
	const current = secret.keys.get(secret.currentVersion);
	if (current) {
		values.push(current);
	}
	for (const [version, value] of secret.keys) {
		if (version !== secret.currentVersion) {
			values.push(value);
		}
	}
	if (
		secret.legacySecret &&
		!values.some((value) => value === secret.legacySecret)
	) {
		values.push(secret.legacySecret);
	}
	return values;
}
