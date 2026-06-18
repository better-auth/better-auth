import { base64Url } from "@better-auth/utils/base64";
import type { OAuth2Tokens } from "./oauth-provider";

/**
 * Parse a provider's `scope` token-response field into a string array.
 *
 * RFC 6749 Section 3.3 defines `scope` as a space-delimited string, but
 * providers vary: some return an already-split array. Accept both forms and
 * drop empty or non-string entries.
 *
 * @see https://github.com/better-auth/better-auth/issues/9076
 */
export function parseScopeField(scope: unknown): string[] {
	if (Array.isArray(scope)) {
		return scope
			.map((s) => (typeof s === "string" ? s.trim() : ""))
			.filter(Boolean);
	}
	if (typeof scope === "string") {
		return scope.trim().split(/\s+/).filter(Boolean);
	}
	return [];
}

export function getOAuth2Tokens(data: Record<string, any>): OAuth2Tokens {
	const getDate = (seconds: number) => {
		const now = new Date();
		return new Date(now.getTime() + seconds * 1000);
	};

	return {
		tokenType: data.token_type,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		accessTokenExpiresAt: data.expires_in
			? getDate(data.expires_in)
			: undefined,
		refreshTokenExpiresAt: data.refresh_token_expires_in
			? getDate(data.refresh_token_expires_in)
			: undefined,
		scopes: parseScopeField(data.scope),
		idToken: data.id_token,
		// Preserve the raw token response for provider-specific fields
		raw: data,
	};
}

/**
 * Fill in `accessTokenExpiresAt` from the provider's configured
 * `accessTokenExpiresIn` when the token response omitted `expires_in`. Without a
 * known expiry, `getAccessToken` cannot tell the token is expired and never
 * refreshes it. No-op when the provider already supplied an expiry or no
 * fallback is configured.
 */
export function applyDefaultAccessTokenExpiry(
	tokens: OAuth2Tokens,
	accessTokenExpiresIn: number | undefined,
): OAuth2Tokens {
	if (!tokens.accessTokenExpiresAt && accessTokenExpiresIn) {
		tokens.accessTokenExpiresAt = new Date(
			Date.now() + accessTokenExpiresIn * 1000,
		);
	}
	return tokens;
}

/**
 * Compute the union of stored and incoming OAuth scopes, preserving
 * stored insertion order and dropping duplicates.
 */
export function mergeScopes(
	stored: string | null | undefined,
	incoming: string[] | undefined,
): string {
	const existing = stored
		? stored
				.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean)
		: [];
	const next = (incoming ?? []).map((scope) => scope.trim()).filter(Boolean);
	return [...new Set([...existing, ...next])].join(",");
}

/**
 * Return the provider's primary Client ID: the single string, or the entry at
 * array index 0 for the cross-platform form used by ID token audience
 * verification. Index 0 is the designated primary and pairs with
 * `clientSecret` for the authorization code flow; later array entries are
 * only used as additional accepted audiences. Returns `undefined` when the
 * primary value is missing or an empty string.
 */
export function getPrimaryClientId(clientId: unknown): string | undefined {
	const value = Array.isArray(clientId) ? clientId[0] : clientId;
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function generateCodeChallenge(codeVerifier: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
}
