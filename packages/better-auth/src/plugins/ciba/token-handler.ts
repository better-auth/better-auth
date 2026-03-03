/**
 * CIBA Token Handler
 *
 * Handles poll-mode token requests with grant_type=urn:openid:params:grant-type:ciba.
 * Token generation logic is shared with push-delivery via token-utils.ts.
 */

import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
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
import { generateTokensForCibaRequest } from "./token-utils";

const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";
const SLOW_DOWN_INTERVAL_INCREASE = 5000; // 5 seconds in ms per CIBA spec

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
			const oidcPlugin =
				ctx.context.getPlugin("oidc-provider") ||
				ctx.context.getPlugin("oauth-provider");
			const oidcOpts = (oidcPlugin?.options || {}) as OIDCOptions;
			const isOAuthProvider = oidcPlugin?.id === "oauth-provider";
			const defaultStoreMethod = isOAuthProvider
				? (oidcOpts as { disableJwtPlugin?: boolean }).disableJwtPlugin
					? "encrypted"
					: "hashed"
				: "plain";
			const storeMethod: StoreClientSecretOption =
				oidcOpts.storeClientSecret ?? defaultStoreMethod;
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
			type MinimalClient = {
				clientId: string;
				clientSecret: string | null | undefined;
				disabled?: boolean;
			};

			// Check trusted clients first
			const trustedClient = trustedClients?.find(
				(c) => c.clientId === credentials.clientId,
			);
			let client: MinimalClient | undefined = trustedClient
				? {
						clientId: trustedClient.clientId,
						clientSecret: trustedClient.clientSecret,
						disabled: trustedClient.disabled,
					}
				: undefined;

			// If not in trusted clients, check database
			if (!client) {
				const pluginId = oidcPlugin?.id;
				const modelName =
					pluginId === "oidc-provider" ? "oauthApplication" : "oauthClient";
				const dbClient = await ctx.context.adapter
					.findOne<MinimalClient>({
						model: modelName,
						where: [{ field: "clientId", value: credentials.clientId }],
					})
					.catch(() => null);
				if (dbClient && !dbClient.disabled) {
					client = dbClient;
				}
			}

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

			// Check if client is disabled (before expensive secret verification)
			if (client.disabled) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: "Client is disabled",
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

			// Reject polling for push-mode requests
			const deliveryMode = cibaRequest.deliveryMode ?? "poll";
			if (deliveryMode === "push") {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description:
						"This request uses push delivery mode. Tokens will be delivered to the client notification endpoint.",
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

			// Status is "approved" - issue tokens using shared utility
			const tokenResponse = await generateTokensForCibaRequest(
				ctx,
				cibaRequest,
			);

			// Delete the CIBA request
			await deleteCibaRequest(ctx, authReqId);

			// Return OIDC-compliant token response
			return ctx.json(tokenResponse, {
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			});
		}),
	};
}
