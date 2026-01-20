import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api/routes/session";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { TOKEN_VAULT_ERROR_CODES } from "./error-codes";
import type { TokenVaultGrant } from "./schema";

/**
 * Internal options type with required fields filled in
 */
interface TokenVaultInternalOptions {
	encryptionKey: string;
	defaultAccessTokenTTL: string;
	defaultRefreshTokenTTL: string;
	cleanupExpiredTokens: boolean;
	cleanupInterval: string;
	onTokenStored?: (grant: {
		userId: string;
		agentId: string;
		provider: string;
		scopes: string[];
	}) => void | Promise<void>;
	onTokenRetrieved?: (grant: {
		userId: string;
		agentId: string;
		provider: string;
	}) => void | Promise<void>;
	onGrantRevoked?: (grant: {
		userId: string;
		agentId: string;
		provider: string;
	}) => void | Promise<void>;
}

/**
 * Encrypt a token value
 */
async function encryptToken(
	value: string | undefined,
	encryptionKey: string,
): Promise<string | undefined> {
	if (!value) return undefined;
	return symmetricEncrypt({ key: encryptionKey, data: value });
}

/**
 * Decrypt a token value
 */
async function decryptToken(
	value: string | undefined,
	encryptionKey: string,
): Promise<string | undefined> {
	if (!value) return undefined;
	try {
		return symmetricDecrypt({ key: encryptionKey, data: value });
	} catch {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: TOKEN_VAULT_ERROR_CODES.DECRYPTION_FAILED.message,
		});
	}
}

const storeTokenBodySchema = z.object({
	userId: z.string().meta({
		description: "The user ID to store the token for",
	}),
	provider: z.string().meta({
		description: 'The provider name (e.g., "better-auth", "slack", "google")',
	}),
	accessToken: z.string().optional().meta({
		description: "The access token to store",
	}),
	refreshToken: z.string().optional().meta({
		description: "The refresh token to store",
	}),
	idToken: z.string().optional().meta({
		description: "The ID token to store",
	}),
	scopes: z.array(z.string()).meta({
		description: "The scopes granted",
	}),
	accessTokenExpiresAt: z.string().datetime().optional().meta({
		description: "When the access token expires",
	}),
	refreshTokenExpiresAt: z.string().datetime().optional().meta({
		description: "When the refresh token expires",
	}),
	metadata: z.record(z.string(), z.unknown()).optional().meta({
		description: "Additional metadata to store with the grant",
	}),
});

export const createStoreTokenRoute = (opts: TokenVaultInternalOptions) =>
	createAuthEndpoint(
		"/token-vault/store",
		{
			method: "POST",
			body: storeTokenBodySchema,
			metadata: {
				openapi: {
					description:
						"Store OAuth tokens in the vault. Requires agent authentication.",
					responses: {
						200: {
							description: "Token stored successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: { type: "string" },
											userId: { type: "string" },
											agentId: { type: "string" },
											provider: { type: "string" },
											scopes: {
												type: "array",
												items: { type: "string" },
											},
											createdAt: { type: "string", format: "date-time" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			// Get the agent ID from the session (agent must be authenticated)
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Agent authentication required",
				});
			}

			// The agent ID is the session user ID (agents authenticate as themselves)
			const agentId = session.user.id;

			const {
				userId,
				provider,
				accessToken,
				refreshToken,
				idToken,
				scopes,
				accessTokenExpiresAt,
				refreshTokenExpiresAt,
				metadata,
			} = ctx.body;

			// Verify the user exists
			const user = await ctx.context.internalAdapter.findUserById(userId);
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					message: TOKEN_VAULT_ERROR_CODES.USER_NOT_FOUND.message,
				});
			}

			// Check if grant already exists
			const existingGrant = await ctx.context.adapter.findOne<TokenVaultGrant>({
				model: "tokenVault",
				where: [
					{ field: "userId", value: userId },
					{ field: "agentId", value: agentId },
					{ field: "provider", value: provider },
				],
			});

			// Encrypt tokens
			const encryptedAccessToken = await encryptToken(
				accessToken,
				opts.encryptionKey,
			);
			const encryptedRefreshToken = await encryptToken(
				refreshToken,
				opts.encryptionKey,
			);
			const encryptedIdToken = await encryptToken(idToken, opts.encryptionKey);

			const now = new Date();

			if (existingGrant) {
				// Update existing grant
				await ctx.context.adapter.update({
					model: "tokenVault",
					where: [{ field: "id", value: existingGrant.id }],
					update: {
						accessToken: encryptedAccessToken,
						refreshToken: encryptedRefreshToken,
						idToken: encryptedIdToken,
						scopes: JSON.stringify(scopes),
						accessTokenExpiresAt: accessTokenExpiresAt
							? new Date(accessTokenExpiresAt)
							: undefined,
						refreshTokenExpiresAt: refreshTokenExpiresAt
							? new Date(refreshTokenExpiresAt)
							: undefined,
						metadata: metadata ? JSON.stringify(metadata) : undefined,
						revokedAt: null, // Clear revocation if re-storing
						updatedAt: now,
					},
				});

				if (opts.onTokenStored) {
					await opts.onTokenStored({ userId, agentId, provider, scopes });
				}

				return ctx.json({
					id: existingGrant.id,
					userId,
					agentId,
					provider,
					scopes,
					createdAt: existingGrant.createdAt,
					updatedAt: now,
				});
			}

			// Create new grant
			const grant = await ctx.context.adapter.create<TokenVaultGrant>({
				model: "tokenVault",
				data: {
					userId,
					agentId,
					provider,
					accessToken: encryptedAccessToken,
					refreshToken: encryptedRefreshToken,
					idToken: encryptedIdToken,
					scopes: JSON.stringify(scopes),
					accessTokenExpiresAt: accessTokenExpiresAt
						? new Date(accessTokenExpiresAt)
						: undefined,
					refreshTokenExpiresAt: refreshTokenExpiresAt
						? new Date(refreshTokenExpiresAt)
						: undefined,
					metadata: metadata ? JSON.stringify(metadata) : undefined,
					createdAt: now,
					updatedAt: now,
				},
			});

			if (opts.onTokenStored) {
				await opts.onTokenStored({ userId, agentId, provider, scopes });
			}

			return ctx.json({
				id: grant.id,
				userId,
				agentId,
				provider,
				scopes,
				createdAt: grant.createdAt,
				updatedAt: grant.updatedAt,
			});
		},
	);

const retrieveTokenBodySchema = z.object({
	userId: z.string().meta({
		description: "The user ID to retrieve tokens for",
	}),
	provider: z.string().meta({
		description: "The provider name",
	}),
});

export const createRetrieveTokenRoute = (opts: TokenVaultInternalOptions) =>
	createAuthEndpoint(
		"/token-vault/retrieve",
		{
			method: "POST",
			body: retrieveTokenBodySchema,
			metadata: {
				openapi: {
					description:
						"Retrieve OAuth tokens from the vault. Only the agent that stored the tokens can retrieve them.",
					responses: {
						200: {
							description: "Tokens retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											accessToken: { type: "string" },
											refreshToken: { type: "string" },
											idToken: { type: "string" },
											scopes: {
												type: "array",
												items: { type: "string" },
											},
											accessTokenExpiresAt: {
												type: "string",
												format: "date-time",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Agent authentication required",
				});
			}

			const agentId = session.user.id;
			const { userId, provider } = ctx.body;

			const grant = await ctx.context.adapter.findOne<TokenVaultGrant>({
				model: "tokenVault",
				where: [
					{ field: "userId", value: userId },
					{ field: "agentId", value: agentId },
					{ field: "provider", value: provider },
				],
			});

			if (!grant) {
				throw new APIError("NOT_FOUND", {
					message: TOKEN_VAULT_ERROR_CODES.GRANT_NOT_FOUND.message,
				});
			}

			if (grant.revokedAt) {
				throw new APIError("FORBIDDEN", {
					message: TOKEN_VAULT_ERROR_CODES.GRANT_REVOKED.message,
				});
			}

			// Check if access token has expired
			if (
				grant.accessTokenExpiresAt &&
				new Date(grant.accessTokenExpiresAt) < new Date()
			) {
				// Access token expired, but refresh token might still be valid
				if (
					!grant.refreshToken ||
					(grant.refreshTokenExpiresAt &&
						new Date(grant.refreshTokenExpiresAt) < new Date())
				) {
					throw new APIError("FORBIDDEN", {
						message: TOKEN_VAULT_ERROR_CODES.GRANT_EXPIRED.message,
					});
				}
			}

			// Update last used timestamp
			await ctx.context.adapter.update({
				model: "tokenVault",
				where: [{ field: "id", value: grant.id }],
				update: { lastUsedAt: new Date() },
			});

			if (opts.onTokenRetrieved) {
				await opts.onTokenRetrieved({ userId, agentId, provider });
			}

			// Decrypt tokens
			const accessToken = await decryptToken(
				grant.accessToken,
				opts.encryptionKey,
			);
			const refreshToken = await decryptToken(
				grant.refreshToken,
				opts.encryptionKey,
			);
			const idToken = await decryptToken(grant.idToken, opts.encryptionKey);

			return ctx.json({
				accessToken,
				refreshToken,
				idToken,
				scopes: JSON.parse(grant.scopes),
				accessTokenExpiresAt: grant.accessTokenExpiresAt,
				refreshTokenExpiresAt: grant.refreshTokenExpiresAt,
			});
		},
	);

export const createListGrantsRoute = (opts: TokenVaultInternalOptions) =>
	createAuthEndpoint(
		"/token-vault/grants",
		{
			method: "GET",
			metadata: {
				openapi: {
					description:
						"List all token grants for the authenticated user. Users can see what agents have access to their accounts.",
					responses: {
						200: {
							description: "List of grants",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											grants: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: { type: "string" },
														agentId: { type: "string" },
														provider: { type: "string" },
														scopes: {
															type: "array",
															items: { type: "string" },
														},
														createdAt: { type: "string", format: "date-time" },
														lastUsedAt: { type: "string", format: "date-time" },
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}

			const userId = session.user.id;

			const grants = await ctx.context.adapter.findMany<TokenVaultGrant>({
				model: "tokenVault",
				where: [
					{ field: "userId", value: userId },
					{ field: "revokedAt", value: null },
				],
			});

			return ctx.json({
				grants: grants.map((grant) => ({
					id: grant.id,
					agentId: grant.agentId,
					provider: grant.provider,
					scopes: JSON.parse(grant.scopes),
					createdAt: grant.createdAt,
					updatedAt: grant.updatedAt,
					lastUsedAt: grant.lastUsedAt,
				})),
			});
		},
	);

const revokeGrantBodySchema = z.object({
	grantId: z.string().meta({
		description: "The grant ID to revoke",
	}),
});

export const createRevokeGrantRoute = (opts: TokenVaultInternalOptions) =>
	createAuthEndpoint(
		"/token-vault/revoke",
		{
			method: "POST",
			body: revokeGrantBodySchema,
			metadata: {
				openapi: {
					description:
						"Revoke a token grant. The user can revoke any grant for their account.",
					responses: {
						200: {
							description: "Grant revoked successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: { type: "boolean" },
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}

			const userId = session.user.id;
			const { grantId } = ctx.body;

			const grant = await ctx.context.adapter.findOne<TokenVaultGrant>({
				model: "tokenVault",
				where: [{ field: "id", value: grantId }],
			});

			if (!grant) {
				throw new APIError("NOT_FOUND", {
					message: TOKEN_VAULT_ERROR_CODES.GRANT_NOT_FOUND.message,
				});
			}

			// Users can only revoke their own grants
			if (grant.userId !== userId) {
				throw new APIError("FORBIDDEN", {
					message: TOKEN_VAULT_ERROR_CODES.UNAUTHORIZED_AGENT.message,
				});
			}

			// Soft delete by setting revokedAt
			await ctx.context.adapter.update({
				model: "tokenVault",
				where: [{ field: "id", value: grantId }],
				update: { revokedAt: new Date() },
			});

			if (opts.onGrantRevoked) {
				await opts.onGrantRevoked({
					userId: grant.userId,
					agentId: grant.agentId,
					provider: grant.provider,
				});
			}

			return ctx.json({ success: true });
		},
	);
