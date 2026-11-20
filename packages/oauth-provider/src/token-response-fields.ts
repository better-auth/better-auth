/**
 * The token response fields the provider owns (RFC 6749 §5.1, RFC 8693
 * §2.2.1, RFC 9396 §7). Only an extension's `tokenResponseFields` is held to
 * this list: the provider overwrites the first seven wherever they come from,
 * and a grant's own `tokenResponse` may set `issued_token_type`. Keep it in
 * step with the "Token response fields" section of `reference.mdx`.
 */
export const RESERVED_TOKEN_RESPONSE_FIELDS: ReadonlySet<string> = new Set([
	"access_token",
	"token_type",
	"expires_in",
	"expires_at",
	"refresh_token",
	"scope",
	"id_token",
	"issued_token_type",
	"authorization_details",
]);
