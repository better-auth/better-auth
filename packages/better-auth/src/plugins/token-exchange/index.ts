import type { BetterAuthPlugin } from "@better-auth/core";
import { TOKEN_EXCHANGE_ERROR_CODES } from "./error-codes";
import { createTokenExchangeRoute } from "./routes";
import type { TokenExchangeOptions } from "./types";
import { TOKEN_TYPES } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		"token-exchange": {
			creator: typeof tokenExchange;
		};
	}
}

export { TOKEN_EXCHANGE_ERROR_CODES } from "./error-codes";
export type { TokenExchangeOptions, TokenType } from "./types";
export { TOKEN_EXCHANGE_GRANT_TYPE, TOKEN_TYPES } from "./types";

/**
 * Token Exchange Plugin (RFC 8693)
 *
 * Enables OAuth 2.0 Token Exchange for delegation and impersonation.
 * Allows agents to exchange tokens for scoped, short-lived tokens
 * with actor claims for audit trails.
 *
 * Features:
 * - RFC 8693 compliant token exchange
 * - Actor claims (act) for delegation chain tracking
 * - Scope narrowing (exchanged token can only have subset of original scopes)
 * - Integration with Token Vault for grant verification
 * - Custom validation hooks
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { tokenExchange, tokenVault } from "better-auth/plugins";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     tokenVault({
 *       encryptionKey: process.env.TOKEN_VAULT_KEY!,
 *     }),
 *     tokenExchange({
 *       exchangedTokenTTL: "1h",
 *       requireVaultGrant: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @example
 * ```ts
 * // Client usage
 * const response = await fetch("/oauth/token", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/x-www-form-urlencoded" },
 *   body: new URLSearchParams({
 *     grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
 *     subject_token: userAccessToken,
 *     subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
 *     actor_token: agentToken,
 *     actor_token_type: "urn:ietf:params:oauth:token-type:access_token",
 *     scope: "read:analytics",
 *   }),
 * });
 * ```
 */
import type { TokenType } from "./types";

/**
 * Internal options type with required fields filled in
 */
interface TokenExchangeInternalOptions {
	exchangedTokenTTL: string;
	requireVaultGrant: boolean;
	allowedSubjectTokenTypes: TokenType[];
	validateExchange?: TokenExchangeOptions["validateExchange"];
	onExchange?: TokenExchangeOptions["onExchange"];
	generateToken?: TokenExchangeOptions["generateToken"];
}

export const tokenExchange = (options?: TokenExchangeOptions) => {
	const opts: TokenExchangeInternalOptions = {
		exchangedTokenTTL: options?.exchangedTokenTTL ?? "1h",
		requireVaultGrant: options?.requireVaultGrant ?? true,
		allowedSubjectTokenTypes: options?.allowedSubjectTokenTypes ?? [
			TOKEN_TYPES.ACCESS_TOKEN,
		],
		validateExchange: options?.validateExchange,
		onExchange: options?.onExchange,
		generateToken: options?.generateToken,
	};

	return {
		id: "token-exchange",
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/oauth/token`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.exchangeToken`
			 *
			 * Exchange a token for another token (RFC 8693).
			 * Supports delegation, impersonation, and scope narrowing.
			 *
			 * Request body (application/x-www-form-urlencoded):
			 * - grant_type: "urn:ietf:params:oauth:grant-type:token-exchange"
			 * - subject_token: The token to exchange
			 * - subject_token_type: Type of the subject token
			 * - actor_token: (optional) Token representing the actor
			 * - actor_token_type: (optional) Type of actor token
			 * - scope: (optional) Requested scopes
			 *
			 * Response includes:
			 * - access_token: The exchanged token
			 * - issued_token_type: Type of issued token
			 * - token_type: "Bearer"
			 * - expires_in: Token lifetime in seconds
			 * - scope: Granted scopes
			 */
			exchangeToken: createTokenExchangeRoute(opts),
		},
		$ERROR_CODES: TOKEN_EXCHANGE_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};
