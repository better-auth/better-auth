import { base64Url } from "@better-auth/utils/base64";
import type { OAuth2Tokens } from "./oauth-provider";

/**
 * Parse a provider's `scope` token-response field into a string array.
 *
 * RFC 6749 §3.3 defines `scope` as a space-delimited string, but providers
 * vary: some (e.g. Twitch) return an already-split array. Accept both, plus the
 * omitted/empty case, without ever calling `.split` on a non-string. Returns
 * `[]` when no scope is present.
 *
 * @see https://github.com/better-auth/better-auth/issues/9076
 */
function parseScopeField(scope: unknown): string[] {
	if (Array.isArray(scope)) return scope;
	if (typeof scope === "string") return scope.split(" ").filter(Boolean);
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
 * Union two scope sets into a single normalized array.
 *
 * Scope order is insignificant per RFC 6749 §3.3, so normalize for idempotent
 * writes and trivial comparisons: trim each token, drop empties, dedupe, and
 * sort ascending. Returns `[]` when the union is empty.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
 */
export function mergeScopes(
	stored: string[] | null | undefined,
	incoming: string[] | undefined,
): string[] {
	const normalized = new Set<string>();
	for (const scope of [...(stored ?? []), ...(incoming ?? [])]) {
		const trimmed = scope.trim();
		if (trimmed) normalized.add(trimmed);
	}
	return [...normalized].sort();
}

/**
 * Accumulate the durable granted-scope set after an authorization or token
 * exchange.
 *
 * The provider's echoed `scope` is authoritative when present. RFC 6749 §3.3
 * and §5.1 say an omitted or empty echo means the grant equals what was
 * requested, so fall back to `requested` in that case. The result unions onto
 * the stored grant (never narrows on a normal write) and is normalized per
 * {@link mergeScopes}.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-5.1
 */
export function accumulateGrantedScopes(
	stored: string[] | null | undefined,
	echoed: string[] | undefined,
	requested: string[] | undefined,
): string[] {
	const granted = echoed?.length ? echoed : requested;
	return mergeScopes(stored, granted);
}

/**
 * Test whether a granted-scope set contains a specific scope.
 *
 * Accepts the normalized `account.grantedScopes` array, or a single
 * space/comma-delimited string for convenience (e.g. a raw provider `scope`
 * value). Matching is exact and case-sensitive per RFC 6749 §3.3.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
 */
export function hasGrantedScope(
	granted: string[] | string | null | undefined,
	scope: string,
): boolean {
	if (!granted) return false;
	const scopes = Array.isArray(granted)
		? granted
		: granted.split(/[\s,]+/).filter(Boolean);
	return scopes.includes(scope);
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
