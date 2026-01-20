import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "../../db";
import { TOKEN_VAULT_ERROR_CODES } from "./error-codes";
import {
	createListGrantsRoute,
	createRetrieveTokenRoute,
	createRevokeGrantRoute,
	createStoreTokenRoute,
} from "./routes";
import { schema } from "./schema";
import type { TokenVaultOptions } from "./types";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		"token-vault": {
			creator: typeof tokenVault;
		};
	}
}

export { TOKEN_VAULT_ERROR_CODES } from "./error-codes";

/**
 * Token Vault Plugin
 *
 * Provides secure encrypted storage for OAuth tokens, enabling AI agents
 * to act on behalf of users without requiring the user to be present.
 *
 * Features:
 * - XChaCha20-Poly1305 encryption for tokens at rest
 * - Support for multiple providers (Better Auth, Slack, Google, etc.)
 * - Grant management (store, retrieve, revoke)
 * - User visibility into active grants
 * - Optional external storage adapters (HashiCorp Vault, AWS Secrets Manager)
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { tokenVault } from "better-auth/plugins";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     tokenVault({
 *       encryptionKey: process.env.TOKEN_VAULT_KEY!,
 *     }),
 *   ],
 * });
 * ```
 */
/**
 * Internal options type with required fields filled in
 */
interface TokenVaultInternalOptions {
	encryptionKey: string;
	storage?: TokenVaultOptions["storage"];
	defaultAccessTokenTTL: string;
	defaultRefreshTokenTTL: string;
	cleanupExpiredTokens: boolean;
	cleanupInterval: string;
	onTokenStored?: TokenVaultOptions["onTokenStored"];
	onTokenRetrieved?: TokenVaultOptions["onTokenRetrieved"];
	onGrantRevoked?: TokenVaultOptions["onGrantRevoked"];
	schema?: TokenVaultOptions["schema"];
}

export const tokenVault = (options: TokenVaultOptions) => {
	if (!options.encryptionKey) {
		throw new Error(TOKEN_VAULT_ERROR_CODES.ENCRYPTION_KEY_REQUIRED.message);
	}

	if (options.encryptionKey.length < 32) {
		console.warn(
			"[token-vault] Warning: Encryption key should be at least 32 characters for security",
		);
	}

	const opts: TokenVaultInternalOptions = {
		encryptionKey: options.encryptionKey,
		storage: options.storage,
		defaultAccessTokenTTL: options.defaultAccessTokenTTL ?? "1h",
		defaultRefreshTokenTTL: options.defaultRefreshTokenTTL ?? "30d",
		cleanupExpiredTokens: options.cleanupExpiredTokens ?? true,
		cleanupInterval: options.cleanupInterval ?? "1h",
		onTokenStored: options.onTokenStored,
		onTokenRetrieved: options.onTokenRetrieved,
		onGrantRevoked: options.onGrantRevoked,
		schema: options.schema,
	};

	return {
		id: "token-vault",
		schema: mergeSchema(schema, options.schema),
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/token-vault/store`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.storeToken`
			 *
			 * **client:**
			 * `authClient.tokenVault.store`
			 *
			 * Store OAuth tokens in the vault. Requires agent authentication.
			 * Tokens are encrypted with XChaCha20-Poly1305 before storage.
			 */
			storeToken: createStoreTokenRoute(opts),

			/**
			 * ### Endpoint
			 *
			 * POST `/token-vault/retrieve`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.retrieveToken`
			 *
			 * **client:**
			 * `authClient.tokenVault.retrieve`
			 *
			 * Retrieve OAuth tokens from the vault.
			 * Only the agent that stored the tokens can retrieve them.
			 */
			retrieveToken: createRetrieveTokenRoute(opts),

			/**
			 * ### Endpoint
			 *
			 * GET `/token-vault/grants`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.listGrants`
			 *
			 * **client:**
			 * `authClient.tokenVault.listGrants`
			 *
			 * List all token grants for the authenticated user.
			 * Users can see what agents have access to their accounts.
			 */
			listGrants: createListGrantsRoute(opts),

			/**
			 * ### Endpoint
			 *
			 * POST `/token-vault/revoke`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.revokeGrant`
			 *
			 * **client:**
			 * `authClient.tokenVault.revoke`
			 *
			 * Revoke a token grant. The user can revoke any grant for their account.
			 * Revocation is immediate and the agent will no longer be able to access tokens.
			 */
			revokeGrant: createRevokeGrantRoute(opts),
		},
		$ERROR_CODES: TOKEN_VAULT_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
