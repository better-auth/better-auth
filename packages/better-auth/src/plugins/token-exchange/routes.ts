import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { signJWT, verifyJWT } from "../../crypto/jwt";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
import { TOKEN_EXCHANGE_ERROR_CODES } from "./error-codes";
import type { ActorTokenInfo, SubjectTokenInfo, TokenType } from "./types";

/**
 * Internal options type with required fields filled in
 */
interface TokenExchangeInternalOptions {
	exchangedTokenTTL: string;
	requireVaultGrant: boolean;
	allowedSubjectTokenTypes: TokenType[];
	validateExchange?: (ctx: {
		subject: SubjectTokenInfo;
		actor?: ActorTokenInfo;
		requestedScopes: string[];
		resource?: string;
		audience?: string;
	}) => boolean | Promise<boolean>;
	onExchange?: (exchange: {
		subject: SubjectTokenInfo;
		actor?: ActorTokenInfo;
		scopes: string[];
		token: string;
	}) => void | Promise<void>;
	generateToken?: (ctx: {
		subject: SubjectTokenInfo;
		actor?: ActorTokenInfo;
		scopes: string[];
		expiresIn: number;
	}) => string | Promise<string>;
}

import { TOKEN_EXCHANGE_GRANT_TYPE, TOKEN_TYPES } from "./types";

const tokenExchangeBodySchema = z.object({
	grant_type: z.literal(TOKEN_EXCHANGE_GRANT_TYPE).meta({
		description: "The grant type for token exchange (RFC 8693)",
	}),
	subject_token: z.string().meta({
		description: "The token to be exchanged",
	}),
	subject_token_type: z
		.enum([
			TOKEN_TYPES.ACCESS_TOKEN,
			TOKEN_TYPES.REFRESH_TOKEN,
			TOKEN_TYPES.ID_TOKEN,
			TOKEN_TYPES.JWT,
		])
		.meta({
			description: "The type of the subject token",
		}),
	actor_token: z.string().optional().meta({
		description: "Token representing the actor (agent) performing the exchange",
	}),
	actor_token_type: z
		.enum([
			TOKEN_TYPES.ACCESS_TOKEN,
			TOKEN_TYPES.REFRESH_TOKEN,
			TOKEN_TYPES.ID_TOKEN,
			TOKEN_TYPES.JWT,
		])
		.optional()
		.meta({
			description: "The type of the actor token",
		}),
	scope: z.string().optional().meta({
		description: "Space-separated list of scopes for the exchanged token",
	}),
	resource: z.string().optional().meta({
		description: "URI of the target resource server",
	}),
	audience: z.string().optional().meta({
		description: "Logical name of the target service",
	}),
});

const tokenExchangeErrorSchema = z.object({
	error: z
		.enum([
			"invalid_request",
			"invalid_client",
			"invalid_grant",
			"unauthorized_client",
			"unsupported_grant_type",
			"invalid_scope",
			"invalid_target",
		])
		.meta({
			description: "OAuth 2.0 error code",
		}),
	error_description: z.string().meta({
		description: "Human-readable error description",
	}),
});

/**
 * Validate and extract information from a subject token
 */
async function validateSubjectToken(
	token: string,
	tokenType: TokenType,
	secret: string,
): Promise<SubjectTokenInfo | null> {
	// For now, we only support access tokens (session tokens)
	if (tokenType !== TOKEN_TYPES.ACCESS_TOKEN) {
		return null;
	}

	// Try to verify as JWT
	const payload = await verifyJWT<{
		sub?: string;
		userId?: string;
		scope?: string;
		scopes?: string[];
		sessionId?: string;
	}>(token, secret);

	if (payload) {
		const userId = payload.sub || payload.userId;
		if (!userId) return null;

		const scopes = payload.scopes || (payload.scope?.split(" ") ?? []);

		return {
			userId,
			scopes,
			sessionId: payload.sessionId,
			token,
			tokenType,
		};
	}

	return null;
}

/**
 * Validate and extract information from an actor token
 */
async function validateActorToken(
	token: string,
	tokenType: TokenType,
	secret: string,
): Promise<ActorTokenInfo | null> {
	if (tokenType !== TOKEN_TYPES.ACCESS_TOKEN) {
		return null;
	}

	const payload = await verifyJWT<{
		sub?: string;
		client_id?: string;
		clientId?: string;
	}>(token, secret);

	if (payload) {
		const sub = payload.sub;
		const clientId = payload.client_id || payload.clientId || payload.sub;

		if (!sub || !clientId) return null;

		return {
			clientId,
			sub,
			token,
			tokenType,
		};
	}

	return null;
}

export const createTokenExchangeRoute = (opts: TokenExchangeInternalOptions) =>
	createAuthEndpoint(
		"/oauth/token",
		{
			method: "POST",
			body: tokenExchangeBodySchema,
			error: tokenExchangeErrorSchema,
			metadata: {
				openapi: {
					description: `Token Exchange (RFC 8693)

Exchange a token for another token with different characteristics.
Used for delegation, impersonation, and scope narrowing.

The exchanged token will include:
- \`sub\`: The user ID from the subject token
- \`act\`: Actor claim with the agent's client ID (if actor_token provided)
- \`scope\`: The requested scopes (must be subset of subject token scopes)`,
					responses: {
						200: {
							description: "Token exchange successful",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											access_token: {
												type: "string",
												description: "The exchanged access token",
											},
											issued_token_type: {
												type: "string",
												description: "Type of the issued token",
											},
											token_type: {
												type: "string",
												description: "Token type (Bearer)",
											},
											expires_in: {
												type: "number",
												description: "Token lifetime in seconds",
											},
											scope: {
												type: "string",
												description: "Granted scopes",
											},
										},
									},
								},
							},
						},
						400: {
							description: "Token exchange error",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											error: { type: "string" },
											error_description: { type: "string" },
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
			const {
				subject_token,
				subject_token_type,
				actor_token,
				actor_token_type,
				scope,
				resource,
				audience,
			} = ctx.body;

			const secret = ctx.context.secret;

			// Validate subject token type
			if (!opts.allowedSubjectTokenTypes.includes(subject_token_type)) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description:
						TOKEN_EXCHANGE_ERROR_CODES.UNSUPPORTED_TOKEN_TYPE.message,
				});
			}

			// Validate subject token
			const subjectInfo = await validateSubjectToken(
				subject_token,
				subject_token_type,
				secret,
			);

			if (!subjectInfo) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description:
						TOKEN_EXCHANGE_ERROR_CODES.INVALID_SUBJECT_TOKEN.message,
				});
			}

			// Verify user exists
			const user = await ctx.context.internalAdapter.findUserById(
				subjectInfo.userId,
			);
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: TOKEN_EXCHANGE_ERROR_CODES.USER_NOT_FOUND.message,
				});
			}

			// Validate actor token if provided
			let actorInfo: ActorTokenInfo | undefined;
			if (actor_token && actor_token_type) {
				actorInfo =
					(await validateActorToken(actor_token, actor_token_type, secret)) ??
					undefined;

				if (!actorInfo) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description:
							TOKEN_EXCHANGE_ERROR_CODES.INVALID_ACTOR_TOKEN.message,
					});
				}
			}

			// Parse and validate requested scopes
			const requestedScopes = scope?.split(" ").filter(Boolean) || [];
			const subjectScopes = subjectInfo.scopes;

			// Ensure requested scopes are subset of subject scopes
			if (requestedScopes.length > 0 && subjectScopes.length > 0) {
				const invalidScopes = requestedScopes.filter(
					(s) => !subjectScopes.includes(s),
				);
				if (invalidScopes.length > 0) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_scope",
						error_description: TOKEN_EXCHANGE_ERROR_CODES.INVALID_SCOPE.message,
					});
				}
			}

			const finalScopes =
				requestedScopes.length > 0 ? requestedScopes : subjectScopes;

			// Check vault grant if required
			if (opts.requireVaultGrant && actorInfo) {
				const grant = await ctx.context.adapter.findOne({
					model: "tokenVault",
					where: [
						{ field: "userId", value: subjectInfo.userId },
						{ field: "agentId", value: actorInfo.sub },
						{ field: "provider", value: "better-auth" },
						{ field: "revokedAt", value: null },
					],
				});

				if (!grant) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description: TOKEN_EXCHANGE_ERROR_CODES.ACCESS_DENIED.message,
					});
				}
			}

			// Custom validation hook
			if (opts.validateExchange) {
				const allowed = await opts.validateExchange({
					subject: subjectInfo,
					actor: actorInfo,
					requestedScopes,
					resource,
					audience,
				});

				if (!allowed) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_grant",
						error_description:
							TOKEN_EXCHANGE_ERROR_CODES.EXCHANGE_NOT_ALLOWED.message,
					});
				}
			}

			// Calculate expiration
			const expiresIn = Math.floor(
				ms(opts.exchangedTokenTTL as TimeString) / 1000,
			);

			// Build token payload
			const tokenPayload: Record<string, unknown> = {
				sub: subjectInfo.userId,
				scope: finalScopes.join(" "),
				token_type: "exchanged",
			};

			// Add actor claim if present
			if (actorInfo) {
				tokenPayload.act = {
					sub: actorInfo.sub,
					client_id: actorInfo.clientId,
				};
			}

			// Add audience if specified
			if (audience) {
				tokenPayload.aud = audience;
			}

			// Generate token
			let exchangedToken: string;
			if (opts.generateToken) {
				exchangedToken = await opts.generateToken({
					subject: subjectInfo,
					actor: actorInfo,
					scopes: finalScopes,
					expiresIn,
				});
			} else {
				exchangedToken = await signJWT(tokenPayload, secret, expiresIn);
			}

			// Call onExchange hook
			if (opts.onExchange) {
				await opts.onExchange({
					subject: subjectInfo,
					actor: actorInfo,
					scopes: finalScopes,
					token: exchangedToken,
				});
			}

			return ctx.json(
				{
					access_token: exchangedToken,
					issued_token_type: TOKEN_TYPES.ACCESS_TOKEN,
					token_type: "Bearer",
					expires_in: expiresIn,
					scope: finalScopes.join(" "),
				},
				{
					headers: {
						"Cache-Control": "no-store",
						Pragma: "no-cache",
					},
				},
			);
		},
	);
