export interface SecretConfig {
	/** Map of version number → secret value */
	keys: Map<number, string>;
	/** Version to use for new encryption (first entry in secrets array) */
	currentVersion: number;
	/** Legacy secret for bare-hex fallback (from BETTER_AUTH_SECRET) */
	legacySecret?: string;
}

/**
 * Resolves candidate secrets in rotation order.
 * Current active secret is always first, followed by older rotated secrets,
 * and finally any legacySecret not already included.
 */
export function getCandidateSecrets(
	secretConfig?: string | SecretConfig | null,
	secretFallback?: string | null,
): string[] {
	if (!secretConfig) {
		return secretFallback ? [secretFallback] : [];
	}
	if (typeof secretConfig === "string") {
		return [secretConfig];
	}
	const result: string[] = [];
	const currentSecret = secretConfig.keys.get(secretConfig.currentVersion);
	if (currentSecret) {
		result.push(currentSecret);
	}
	for (const [version, val] of secretConfig.keys) {
		if (version !== secretConfig.currentVersion && !result.includes(val)) {
			result.push(val);
		}
	}
	if (secretConfig.legacySecret && !result.includes(secretConfig.legacySecret)) {
		result.push(secretConfig.legacySecret);
	}
	if (result.length === 0 && secretFallback) {
		result.push(secretFallback);
	}
	return result;
}

