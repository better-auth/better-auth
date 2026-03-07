/**
 * Async Auth Token Handler
 *
 * Handles poll-mode token requests with grant_type=urn:openid:params:grant-type:ciba.
 * Token generation logic is shared with push-delivery via token-utils.ts.
 */

import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getOidcPluginContext, validateClientCredentials } from "./client-auth";
import { ASYNC_AUTH_ERROR_CODES } from "./error-codes";
import {
	deleteAsyncAuthRequest,
	findAsyncAuthRequest,
	updateAsyncAuthRequest,
} from "./storage";
import { generateTokensForAsyncAuthRequest } from "./token-utils";
import type { AsyncAuthInternalOptions } from "./types";

const CIBA_GRANT_TYPE = "urn:openid:params:grant-type:ciba";
const SLOW_DOWN_INTERVAL_INCREASE = 5000; // 5 seconds in ms per CIBA spec

/**
 * Creates the hook handler for the CIBA grant type on /oauth2/token.
 * Intercepts token requests with grant_type=urn:openid:params:grant-type:ciba
 */
export function createAsyncAuthTokenHandler(opts: AsyncAuthInternalOptions) {
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

			const authReqId = body.auth_req_id as string | undefined;

			if (!authReqId) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: "auth_req_id is required",
				});
			}

			const pluginContext = getOidcPluginContext(ctx);
			const { credentials } = await validateClientCredentials(
				ctx,
				body,
				pluginContext,
				opts.agents,
				opts.ensuredAgents,
			);

			// Find async auth request
			const asyncAuthRequest = await findAsyncAuthRequest(ctx, authReqId);
			if (!asyncAuthRequest) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: ASYNC_AUTH_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			// Verify client matches
			if (asyncAuthRequest.clientId !== credentials.clientId) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: "Client ID mismatch",
				});
			}

			// Reject polling for push-mode requests
			const deliveryMode = asyncAuthRequest.deliveryMode ?? "poll";
			if (deliveryMode === "push") {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description:
						"This request uses push delivery mode. Tokens will be delivered to the client notification endpoint.",
				});
			}

			// Check if expired first (before rate limit check)
			if (asyncAuthRequest.expiresAt < Date.now()) {
				await deleteAsyncAuthRequest(ctx, authReqId);
				throw new APIError("BAD_REQUEST", {
					error: "expired_token",
					error_description: ASYNC_AUTH_ERROR_CODES.EXPIRED_TOKEN.message,
				});
			}

			// Check rate limiting
			if (asyncAuthRequest.lastPolledAt) {
				const timeSinceLastPoll = Date.now() - asyncAuthRequest.lastPolledAt;
				if (timeSinceLastPoll < asyncAuthRequest.pollingInterval) {
					// Per CIBA spec: slow_down should increase the interval by 5 seconds
					await updateAsyncAuthRequest(ctx, authReqId, {
						lastPolledAt: Date.now(),
						pollingInterval:
							asyncAuthRequest.pollingInterval + SLOW_DOWN_INTERVAL_INCREASE,
					});
					throw new APIError("BAD_REQUEST", {
						error: "slow_down",
						error_description: ASYNC_AUTH_ERROR_CODES.SLOW_DOWN.message,
					});
				}
			}

			// Update last polled time
			await updateAsyncAuthRequest(ctx, authReqId, {
				lastPolledAt: Date.now(),
			});

			// Check status
			if (asyncAuthRequest.status === "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "authorization_pending",
					error_description:
						ASYNC_AUTH_ERROR_CODES.AUTHORIZATION_PENDING.message,
				});
			}

			if (asyncAuthRequest.status === "rejected") {
				await deleteAsyncAuthRequest(ctx, authReqId);
				throw new APIError("BAD_REQUEST", {
					error: "access_denied",
					error_description: ASYNC_AUTH_ERROR_CODES.ACCESS_DENIED.message,
				});
			}

			// Status is "approved" - issue tokens using shared utility
			const tokenResponse = await generateTokensForAsyncAuthRequest(
				ctx,
				asyncAuthRequest,
			);

			// Delete the async auth request
			await deleteAsyncAuthRequest(ctx, authReqId);

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
