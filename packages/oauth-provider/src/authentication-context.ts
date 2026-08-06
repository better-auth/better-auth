import { logger } from "@better-auth/core/env";

/**
 * RFC 6711 "unspecified" Authentication Context Class Reference.
 *
 * Better Auth does not currently evaluate a stronger ACR policy, so discovery
 * and ID tokens must not claim an assurance profile such as InCommon bronze.
 */
export const UNSPECIFIED_ACR = "0";

const RESERVED_ID_TOKEN_CLAIMS = new Set([
	"iss",
	"sub",
	"aud",
	"exp",
	"nbf",
	"iat",
	"jti",
	"auth_time",
	"nonce",
	"acr",
	"amr",
	"azp",
	"sid",
	"at_hash",
	"c_hash",
	"s_hash",
]);

/**
 * Removes provider-owned ID token claim names from custom claims.
 *
 * `customIdTokenClaims` is an extension point for additional claims. It must not
 * replace the issuer, subject, audience, lifetime, nonce, authorized party,
 * token-binding hashes, session binding, or authentication context that the
 * provider owns.
 */
export function stripReservedIdTokenClaims(
	claims: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
	if (!claims) return {};
	const stripped: string[] = [];
	const safeClaims = Object.create(null) as Record<string, unknown>;
	for (const [key, value] of Object.entries(claims)) {
		if (RESERVED_ID_TOKEN_CLAIMS.has(key)) {
			stripped.push(key);
			continue;
		}
		safeClaims[key] = value;
	}
	if (stripped.length > 0) {
		logger.warn(
			`oauth-provider: stripped reserved id-token claim name(s): ${stripped.join(
				", ",
			)}. The AS owns these claim values.`,
		);
	}
	return safeClaims;
}
