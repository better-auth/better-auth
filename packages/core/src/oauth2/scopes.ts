import type { ProviderOptions } from "./oauth-provider";

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
export function parseScopeField(scope: unknown): string[] {
	if (Array.isArray(scope)) return scope;
	if (typeof scope === "string") return scope.split(" ").filter(Boolean);
	return [];
}

/**
 * Normalize a scope set into a single deduped, sorted array.
 *
 * Scope order is insignificant per RFC 6749 §3.3, so normalize for idempotent
 * writes and trivial comparisons: trim each token, drop empties, dedupe, and
 * sort ascending. Returns `[]` when the union is empty.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
 */
export function normalizeScopes(
	stored: string[] | null | undefined,
	incoming?: string[] | undefined,
): string[] {
	const normalized = new Set<string>();
	for (const scope of [...(stored ?? []), ...(incoming ?? [])]) {
		const trimmed = scope.trim();
		if (trimmed) normalized.add(trimmed);
	}
	return [...normalized].sort();
}

/**
 * Union the stored granted-scope set with the scopes observed on an
 * authorization or token exchange.
 *
 * The provider's echoed `scope` is authoritative when present. RFC 6749 §3.3
 * and §5.1 say an omitted or empty echo means the grant equals what was
 * requested, so fall back to `requested` in that case. The result unions onto
 * the stored grant (never narrows on a normal write) and is normalized per
 * {@link normalizeScopes}.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-5.1
 */
export function unionGrantedScopes(
	stored: string[] | null | undefined,
	echoed: string[] | undefined,
	requested: string[] | undefined,
): string[] {
	const granted = echoed?.length ? echoed : requested;
	return normalizeScopes(stored, granted);
}

/**
 * Coerce a stored granted-scope value into a usable array.
 *
 * `account.grantedScopes` is nullable (legacy rows and non-OAuth accounts read
 * as unset), and on dialects that store the array as a JSON string a malformed
 * operator backfill could deserialize to a non-array. Both collapse to `[]`
 * here so every reader works against a real `string[]` without re-deriving the
 * guard.
 */
export function readGrantedScopes(
	stored: string[] | null | undefined,
): string[] {
	return Array.isArray(stored) ? stored : [];
}

/**
 * Test whether a normalized granted-scope set contains a specific scope.
 *
 * Matching is exact and case-sensitive per RFC 6749 §3.3. The argument is the
 * normalized `account.grantedScopes` array; a raw provider `scope` string must
 * be run through {@link parseScopeField} first.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
 */
export function includesGrantedScope(
	granted: string[] | null | undefined,
	scope: string,
): boolean {
	return granted?.includes(scope) ?? false;
}

/**
 * Compose the effective scope set to encode in a single authorization URL.
 *
 * Precedence: the provider's built-in defaults (unless `disableDefaultScope`),
 * then the integrator's configured `options.scope`, then the per-request
 * `scopes`. The result is the value persisted into OAuth state as the RFC 6749
 * §5.1 fallback, so it is preserved verbatim (not normalized) to match what is
 * sent to the provider.
 *
 * `defaultScopes` is a parameter rather than a provider-contract field so the
 * runtime-synthesized generic OAuth provider, which has no static default set,
 * can pass its configured scopes here.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-5.1
 */
export function resolveRequestedScopes(
	options: Pick<ProviderOptions, "scope" | "disableDefaultScope"> | undefined,
	defaultScopes: string[],
	perRequestScopes: string[] | undefined,
): string[] {
	const scopes = options?.disableDefaultScope ? [] : [...defaultScopes];
	if (options?.scope) scopes.push(...options.scope);
	if (perRequestScopes) scopes.push(...perRequestScopes);
	return scopes;
}
