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

/**
 * Wraps context.getSignedCookie to verify signed cookies against candidate secrets
 * in rotation order when secret rotation is configured.
 */
export function wrapContextWithRotatedSignedCookies<
	T extends {
		getSignedCookie?: (
			key: string,
			secret?: string,
			prefix?: string,
		) => Promise<string | null | false>;
		context?: {
			secretConfig?: SecretConfig | null;
			secret?: string;
		};
	},
>(context: T): void {
	if (
		context.getSignedCookie &&
		context.context?.secretConfig &&
		!(context as unknown as { __originalGetSignedCookie?: unknown })
			.__originalGetSignedCookie
	) {
		const originalGetSignedCookie = context.getSignedCookie.bind(context);
		(
			context as unknown as {
				__originalGetSignedCookie?: typeof originalGetSignedCookie;
			}
		).__originalGetSignedCookie = originalGetSignedCookie;

		const candidateSecrets = getCandidateSecrets(
			context.context.secretConfig,
			context.context.secret,
		);
		if (candidateSecrets.length > 1) {
			context.getSignedCookie = async (key, secret, prefix) => {
				if (!secret || secret === context.context?.secret) {
					for (const s of candidateSecrets) {
						const val = await originalGetSignedCookie(key, s, prefix);
						if (typeof val === "string") return val;
						if (val === null) return null;
					}
					return false;
				}
				return originalGetSignedCookie(key, secret, prefix);
			};
		}
	}
}

