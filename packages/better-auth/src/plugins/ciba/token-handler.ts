/**
 * CIBA Token Handler
 *
 * TODO: Extract token generation logic to shared utility in oidc-provider/utils.ts
 * The token generation (access token, refresh token, ID token) is duplicated
 * between OIDC provider and CIBA. Should be refactored before production.
 */

import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { SignJWT } from "jose";
import { generateRandomString } from "../../crypto";
import { getClient } from "../oidc-provider";
import type { OIDCOptions } from "../oidc-provider/types";
import type { StoreClientSecretOption } from "../oidc-provider/utils";
import {
	parseClientCredentials,
	verifyClientSecret,
} from "../oidc-provider/utils";
import { CIBA_ERROR_CODES } from "./error-codes";
import {
	deleteCibaRequest,
	findCibaRequest,
	updateCibaRequest,
} from "./storage";

const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 3600;
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = 604800;
const SLOW_DOWN_INTERVAL_INCREASE = 5000; // 5 seconds in ms per CIBA spec

/**
 * Compute at_hash claim for ID token (per OIDC spec)
 */
async function computeAtHash(accessToken: string): Promise<string> {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(accessToken),
	);
	// Take left-most half of the hash
	const halfHash = new Uint8Array(hash).slice(0, 16);
	return base64Url.encode(halfHash, { padding: false });
}

/**
 * Creates the hook handler for CIBA grant type on /oauth2/token.
 * Intercepts token requests with grant_type=urn:openid:params:grant-type:ciba
 */
export function createCibaTokenHandler() {
	return {
		matcher(context: { path?: string }) {
			return context.path === "/oauth2/token";
		},
		handler: createAuthMiddleware(async (ctx) => {
			let body = ctx.body as Record<string, unknown> | undefined;

			if (!body) {
				return;
			}

			if (body instanceof FormData) {
				body = Object.fromEntries(body.entries()) as Record<string, unknown>;
			}

			const grantType = body.grant_type as string | undefined;

			// Only handle CIBA grant type
			if (grantType !== CIBA_GRANT_TYPE) {
				return;
			}

			// Get OIDC provider options
			const oidcPlugin = ctx.context.getPlugin("oidc-provider");
			const oidcOpts = (oidcPlugin?.options || {}) as OIDCOptions;
			const accessTokenExpiresIn =
				oidcOpts.accessTokenExpiresIn ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN;
			const refreshTokenExpiresIn =
				oidcOpts.refreshTokenExpiresIn ?? DEFAULT_REFRESH_TOKEN_EXPIRES_IN;
			const storeMethod: StoreClientSecretOption =
				oidcOpts.storeClientSecret ?? "plain";
			const trustedClients = oidcOpts.trustedClients ?? [];

			const authReqId = body.auth_req_id as string | undefined;

			if (!authReqId) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: "auth_req_id is required",
				});
			}

			// Parse client credentials (supports Basic Auth and body params)
			const credentials = parseClientCredentials(
				body,
				ctx.request?.headers.get("authorization") || null,
			);

			if (!credentials) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: "client_id and client_secret are required",
				});
			}

			// Validate client (check trusted clients first, then database)
			const client = await getClient(credentials.clientId, trustedClients);
			if (!client) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: CIBA_ERROR_CODES.INVALID_CLIENT.message,
				});
			}

			// Confidential clients must have a secret
			if (!client.clientSecret) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: "Client secret is required",
				});
			}

			// Verify client secret
			const isValidSecret = await verifyClientSecret(
				client.clientSecret,
				credentials.clientSecret,
				storeMethod,
				ctx.context.secret,
			);
			if (!isValidSecret) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: CIBA_ERROR_CODES.INVALID_CLIENT.message,
				});
			}

			// Find CIBA request
			const cibaRequest = await findCibaRequest(ctx, authReqId);
			if (!cibaRequest) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			// Verify client matches
			if (cibaRequest.clientId !== credentials.clientId) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: "Client ID mismatch",
				});
			}

			// Check if expired first (before rate limit check)
			if (cibaRequest.expiresAt < Date.now()) {
				await deleteCibaRequest(ctx, authReqId);
				throw new APIError("BAD_REQUEST", {
					error: "expired_token",
					error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
				});
			}

			// Check rate limiting
			if (cibaRequest.lastPolledAt) {
				const timeSinceLastPoll = Date.now() - cibaRequest.lastPolledAt;
				if (timeSinceLastPoll < cibaRequest.pollingInterval) {
					// Per CIBA spec: slow_down should increase the interval by 5 seconds
					await updateCibaRequest(ctx, authReqId, {
						lastPolledAt: Date.now(),
						pollingInterval:
							cibaRequest.pollingInterval + SLOW_DOWN_INTERVAL_INCREASE,
					});
					throw new APIError("BAD_REQUEST", {
						error: "slow_down",
						error_description: CIBA_ERROR_CODES.SLOW_DOWN.message,
					});
				}
			}

			// Update last polled time
			await updateCibaRequest(ctx, authReqId, {
				lastPolledAt: Date.now(),
			});

			// Check status
			if (cibaRequest.status === "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "authorization_pending",
					error_description: CIBA_ERROR_CODES.AUTHORIZATION_PENDING.message,
				});
			}

			if (cibaRequest.status === "rejected") {
				await deleteCibaRequest(ctx, authReqId);
				throw new APIError("BAD_REQUEST", {
					error: "access_denied",
					error_description: CIBA_ERROR_CODES.ACCESS_DENIED.message,
				});
			}

			// Status is "approved" - issue tokens
			const user = await ctx.context.internalAdapter.findUserById(
				cibaRequest.userId,
			);
			if (!user) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					error: "server_error",
					error_description: "User not found",
				});
			}

			// Generate tokens
			const accessToken = generateRandomString(32, "a-z", "A-Z", "0-9");
			const now = Date.now();
			const accessTokenExpiresAt = new Date(now + accessTokenExpiresIn * 1000);

			const requestedScopes = cibaRequest.scope.split(" ");
			const needsRefreshToken = requestedScopes.includes("offline_access");

			// Always generate refresh token for DB storage (unique constraint)
			// but only return it if offline_access scope is requested
			const refreshToken = generateRandomString(32, "a-z", "A-Z", "0-9");
			const refreshTokenExpiresAt = new Date(
				now + refreshTokenExpiresIn * 1000,
			);

			// Store access token
			await ctx.context.adapter.create({
				model: "oauthAccessToken",
				data: {
					accessToken,
					refreshToken,
					accessTokenExpiresAt,
					refreshTokenExpiresAt,
					clientId: credentials.clientId,
					userId: user.id,
					scopes: cibaRequest.scope,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			// Generate ID token with at_hash claim
			const profile = requestedScopes.includes("profile")
				? {
						given_name: user.name?.split(" ")[0],
						family_name: user.name?.split(" ")[1],
						name: user.name,
						picture: user.image,
						updated_at: Math.floor(new Date(user.updatedAt).getTime() / 1000),
					}
				: {};

			const email = requestedScopes.includes("email")
				? {
						email: user.email,
						email_verified: user.emailVerified,
					}
				: {};

			// Compute at_hash for ID token (per OIDC spec)
			const atHash = await computeAtHash(accessToken);

			const idToken = await new SignJWT({
				sub: user.id,
				aud: credentials.clientId,
				iat: Math.floor(now / 1000),
				auth_req_id: authReqId,
				at_hash: atHash,
				...profile,
				...email,
			})
				.setProtectedHeader({ alg: "HS256" })
				.setIssuedAt()
				.setExpirationTime(Math.floor(now / 1000) + accessTokenExpiresIn)
				.setIssuer(ctx.context.baseURL)
				.sign(new TextEncoder().encode(ctx.context.secret));

			// Delete the CIBA request
			await deleteCibaRequest(ctx, authReqId);

			// Return OIDC-compliant token response
			return ctx.json(
				{
					access_token: accessToken,
					token_type: "Bearer",
					expires_in: accessTokenExpiresIn,
					refresh_token: needsRefreshToken ? refreshToken : undefined,
					scope: cibaRequest.scope,
					id_token: requestedScopes.includes("openid") ? idToken : undefined,
				},
				{
					headers: {
						"Cache-Control": "no-store",
						Pragma: "no-cache",
					},
				},
			);
		}),
	};
}
