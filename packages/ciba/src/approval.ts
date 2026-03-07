import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { createUserTokens, getClient } from "@better-auth/oauth-provider";
import * as z from "zod";
import type { CibaOptions } from "./types";
import {
	findCibaRequest,
	updateCibaRequest,
	deleteCibaRequest,
	getOAuthOpts,
} from "./utils";
import { deliverPush, deliverPing, deliverError } from "./push";

/**
 * POST /ciba/authorize — Approve a pending CIBA request.
 * Requires an authenticated session; the user must match cibaRequest.userId.
 */
export function createCibaAuthorize(options: CibaOptions) {
	return createAuthEndpoint(
		"/ciba/authorize",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: z.object({
				auth_req_id: z.string().min(1),
			}),
			metadata: {
				openapi: {
					description: "Approve a CIBA authentication request",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const { auth_req_id: authReqId } = ctx.body;

			const cibaRequest = await findCibaRequest(ctx, authReqId);
			if (!cibaRequest) {
				throw new APIError("NOT_FOUND", {
					error_description: "CIBA request not found",
					error: "invalid_request",
				});
			}


			if (cibaRequest.userId !== session.user.id) {
				throw new APIError("FORBIDDEN", {
					error_description:
						"You are not authorized to approve this request",
					error: "access_denied",
				});
			}


			if (cibaRequest.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					error_description: `Request is already ${cibaRequest.status}`,
					error: "invalid_request",
				});
			}

			if (cibaRequest.expiresAt < new Date()) {
				await deleteCibaRequest(ctx, authReqId);
				throw new APIError("BAD_REQUEST", {
					error_description: "The auth_req_id has expired",
					error: "expired_token",
				});
			}

			await updateCibaRequest(ctx, cibaRequest.id, {
				status: "approved",
			});

			const oauthOpts = getOAuthOpts(ctx);

			if (cibaRequest.deliveryMode === "push") {
				if (
					!cibaRequest.clientNotificationEndpoint ||
					!cibaRequest.clientNotificationToken
				) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error_description:
							"Push-mode request missing notification endpoint or token",
						error: "server_error",
					});
				}

				const client = await getClient(
					ctx as unknown as GenericEndpointContext,
					oauthOpts,
					cibaRequest.clientId,
				);
				if (!client) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error_description: "OAuth client not found",
						error: "server_error",
					});
				}
				if (client.disabled) {
					await deleteCibaRequest(ctx, authReqId);
					throw new APIError("BAD_REQUEST", {
						error_description:
							"OAuth client has been disabled since the request was created",
						error: "invalid_request",
					});
				}

				const scopes = cibaRequest.scope.split(" ");
				const tokenCtx = ctx as unknown as GenericEndpointContext;
				if (cibaRequest.resource) {
					(tokenCtx.body as Record<string, unknown>).resource =
						cibaRequest.resource;
				}

				// Generate tokens, then delete request to prevent replay via polling
				const tokenResult = await createUserTokens(
					tokenCtx,
					oauthOpts,
					client,
					scopes,
					session.user,
					undefined,
					undefined,
					undefined,
					undefined,
					new Date(),
				);

				// Consume the request before push — prevents double-mint
				await deleteCibaRequest(ctx, authReqId);

				// Extract the raw JSON body from createUserTokens result.
				// ctx.json() returns the raw object when asResponse is false (internal calls).
				const tokenBody =
					typeof tokenResult === "object" &&
					tokenResult !== null &&
					"_flag" in tokenResult
						? (tokenResult as { body: Record<string, unknown> })
								.body
						: (tokenResult as Record<string, unknown>);

				deliverPush(
					cibaRequest.clientNotificationEndpoint,
					cibaRequest.clientNotificationToken,
					{ auth_req_id: authReqId, ...tokenBody },
					options.pushRetryAttempts ?? 3,
				).catch(() => {
					// Push delivery failed — tokens are minted, request consumed.
					// Client must use refresh_token or re-initiate.
				});
			} else if (cibaRequest.deliveryMode === "ping") {
				if (
					cibaRequest.clientNotificationEndpoint &&
					cibaRequest.clientNotificationToken
				) {
					deliverPing(
						cibaRequest.clientNotificationEndpoint,
						cibaRequest.clientNotificationToken,
						authReqId,
					).catch(() => {
						// Ping delivery failure: client can still poll
					});
				}
			}

			return ctx.json({ success: true });
		},
	);
}

/**
 * POST /ciba/reject — Reject a pending CIBA request.
 * Requires an authenticated session; the user must match cibaRequest.userId.
 */
export function createCibaReject() {
	return createAuthEndpoint(
		"/ciba/reject",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: z.object({
				auth_req_id: z.string().min(1),
			}),
			metadata: {
				openapi: {
					description: "Reject a CIBA authentication request",
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const { auth_req_id: authReqId } = ctx.body;

			const cibaRequest = await findCibaRequest(ctx, authReqId);
			if (!cibaRequest) {
				throw new APIError("NOT_FOUND", {
					error_description: "CIBA request not found",
					error: "invalid_request",
				});
			}


			if (cibaRequest.userId !== session.user.id) {
				throw new APIError("FORBIDDEN", {
					error_description:
						"You are not authorized to reject this request",
					error: "access_denied",
				});
			}


			if (cibaRequest.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					error_description: `Request is already ${cibaRequest.status}`,
					error: "invalid_request",
				});
			}

			await updateCibaRequest(ctx, cibaRequest.id, {
				status: "rejected",
			});

			// Push mode: deliver error to notification endpoint
			if (
				cibaRequest.deliveryMode === "push" &&
				cibaRequest.clientNotificationEndpoint &&
				cibaRequest.clientNotificationToken
			) {
				deliverError(
					cibaRequest.clientNotificationEndpoint,
					cibaRequest.clientNotificationToken,
					authReqId,
					"access_denied",
					"The user denied the authorization request",
				).catch(() => {
					// Best-effort delivery
				});
			}

			return ctx.json({ success: true });
		},
	);
}
