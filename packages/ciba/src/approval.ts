import type { GenericEndpointContext } from "@better-auth/core";
import { createUserTokens, getClient } from "@better-auth/oauth-provider";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import { deliverError, deliverPing, deliverPush } from "./push";
import type { CibaOptions } from "./types";
import {
	deleteCibaRequest,
	findCibaRequest,
	getOAuthOpts,
	updateCibaRequest,
} from "./utils";

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
					error_description: "You are not authorized to approve this request",
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

			// Defensive re-read: if a concurrent approval already processed
			// this request, the record may be gone or no longer "approved".
			const updated = await findCibaRequest(ctx, authReqId);
			if (!updated || updated.status !== "approved") {
				throw new APIError("BAD_REQUEST", {
					error_description: `Request is already ${updated?.status ?? "consumed"}`,
					error: "invalid_request",
				});
			}

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

				// Build extra claims: act (agent identity) + authorization_details (RAR)
				const pushExtra: {
					accessTokenClaims: Record<string, unknown>;
					tokenResponse?: Record<string, unknown>;
				} = { accessTokenClaims: { act: { sub: client.clientId } } };

				if (cibaRequest.authorizationDetails) {
					try {
						const ad = JSON.parse(cibaRequest.authorizationDetails);
						pushExtra.accessTokenClaims.authorization_details = ad;
						pushExtra.tokenResponse = { authorization_details: ad };
					} catch {
						// Ignore malformed JSON — issue tokens without authorization_details
					}
				}

				if (cibaRequest.agentClaims) {
					try {
						const ac = JSON.parse(cibaRequest.agentClaims);
						if (ac.agent) {
							pushExtra.accessTokenClaims.agent = ac.agent;
						}
					} catch {
						// Ignore malformed agent claims
					}
				}

				// Generate tokens, then delete request to prevent replay via polling
				const tokenResult = await createUserTokens(
					tokenCtx,
					oauthOpts,
					client,
					scopes,
					session.user,
					authReqId,
					undefined,
					undefined,
					undefined,
					new Date(),
					pushExtra,
				);

				// Consume the request before push — prevents double-mint
				await deleteCibaRequest(ctx, authReqId);

				// Extract the raw JSON body from createUserTokens result.
				// Handles both internal calls (_flag wrapper) and Response objects.
				let tokenBody: Record<string, unknown>;
				if (
					typeof Response !== "undefined" &&
					tokenResult instanceof Response
				) {
					tokenBody = (await tokenResult.clone().json()) as Record<
						string,
						unknown
					>;
				} else if (
					typeof tokenResult === "object" &&
					tokenResult !== null &&
					"_flag" in tokenResult
				) {
					tokenBody = (
						tokenResult as unknown as {
							body: Record<string, unknown>;
						}
					).body;
				} else {
					tokenBody = tokenResult as Record<string, unknown>;
				}

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
					error_description: "You are not authorized to reject this request",
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
