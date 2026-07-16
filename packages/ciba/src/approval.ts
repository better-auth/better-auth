import type { GenericEndpointContext } from "@better-auth/core";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import { CIBA_GRANT_TYPE } from "./constants";
import { CIBA_ERROR_CODES } from "./error-codes";
import { deliverError, deliverPing, deliverPush } from "./push";
import type { CibaOptions } from "./types";
import type { CibaRequest } from "./utils";
import {
	buildCibaIssuanceExtras,
	consumePendingCibaRequest,
	deleteCibaRequest,
	findCibaRequestByHash,
	findCibaRequestById,
	getOAuthOptions,
	hashAuthReqId,
	updateCibaRequest,
} from "./utils";

/**
 * Approval accepts one of two identifiers:
 * - `auth_req_id`: the raw, high-entropy token. The out-of-band approval flow
 *   (a link delivered to the user) carries it; the endpoint hashes it to find
 *   the request. Required for push delivery, which echoes it back to the client.
 * - `request_id`: the request's primary id. A first-party, session-authenticated
 *   UI lists the user's own pending requests by id and never holds the raw token
 *   (only its hash is stored). Ownership is enforced by the session, so this is
 *   not a weaker credential for the resource owner.
 */
const approvalBody = z
	.object({
		auth_req_id: z.string().min(1).optional(),
		request_id: z.string().min(1).optional(),
	})
	.refine((body) => Boolean(body.auth_req_id) !== Boolean(body.request_id), {
		message: "Provide exactly one of auth_req_id or request_id",
	});

const DEFAULT_PUSH_RETRY = 3;

/**
 * Resolves the pending request the caller is acting on, by raw `auth_req_id`
 * (hashed) or by `request_id`, then enforces ownership, expiry, and pending
 * status. A missing request and one owned by another user return the same error,
 * so a session cannot probe for others' request ids.
 */
async function resolveOwnedPendingRequest(
	ctx: GenericEndpointContext,
	identifier: { authReqId?: string; requestId?: string },
	userId: string,
): Promise<CibaRequest> {
	const request = identifier.requestId
		? await findCibaRequestById(ctx, identifier.requestId)
		: await findCibaRequestByHash(
				ctx,
				await hashAuthReqId(identifier.authReqId as string),
			);
	if (!request || request.userId !== userId) {
		throw new APIError("NOT_FOUND", {
			error: "invalid_request",
			error_description: CIBA_ERROR_CODES.INVALID_GRANT.message,
		});
	}
	if (request.expiresAt < new Date()) {
		await deleteCibaRequest(ctx, request.id);
		throw new APIError("BAD_REQUEST", {
			error: "expired_token",
			error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
		});
	}
	if (request.status !== "pending") {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: `Request is already ${request.status}`,
		});
	}
	return request;
}

/**
 * Push delivery mints and pushes the token set inline, echoing the raw
 * `auth_req_id` so the client can correlate it. That value is unrecoverable from
 * a `request_id` approval (only the hash is stored), so push must be approved
 * with `auth_req_id`.
 */
function assertPushHasRawToken(
	request: CibaRequest,
	authReqId: string | undefined,
): void {
	if (request.deliveryMode === "push" && !authReqId) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description:
				"Push delivery requires approval by auth_req_id, not request_id.",
		});
	}
}

/**
 * POST /ciba/authorize — the authenticated user approves a pending request. The
 * session user must own the request.
 *
 * For poll/ping delivery this is a plain status transition: the single-use gate
 * is the atomic consume at the token poll (ping additionally notifies the client
 * that it can poll now). For push delivery the token set is minted and delivered
 * inline here, so the request is atomically consumed at approval instead.
 */
export function createCibaAuthorize(options: CibaOptions) {
	const pushRetry = options.pushRetryAttempts ?? DEFAULT_PUSH_RETRY;

	return createAuthEndpoint(
		"/ciba/authorize",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: approvalBody,
			metadata: {
				openapi: { description: "Approve a CIBA authentication request" },
			},
		},
		async (ctx) => {
			const request = await resolveOwnedPendingRequest(
				ctx,
				{ authReqId: ctx.body.auth_req_id, requestId: ctx.body.request_id },
				ctx.context.session.user.id,
			);
			assertPushHasRawToken(request, ctx.body.auth_req_id);

			// Push: mint and deliver the token set inline. The request is atomically
			// claimed before delivery, so a failed push cannot be replayed by polling.
			if (request.deliveryMode === "push") {
				if (
					!(
						request.clientNotificationEndpoint &&
						request.clientNotificationToken
					)
				) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description:
							"Push request is missing its notification endpoint",
					});
				}
				// Enforce step-up before consuming, so a refusal leaves the pending
				// row intact for a retry after the user elevates.
				if (options.enforceTokenAcr) {
					await options.enforceTokenAcr(request, ctx);
				}
				const claimed = await consumePendingCibaRequest(ctx, request.id);
				if (!claimed) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description: CIBA_ERROR_CODES.INVALID_GRANT.message,
					});
				}
				const api = getOAuthProviderApi(
					ctx,
					getOAuthOptions(ctx),
					CIBA_GRANT_TYPE,
				);
				const client = await api.getClient(claimed.clientId);
				if (!client) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description: "The requesting client no longer exists",
					});
				}
				const extras = await buildCibaIssuanceExtras(ctx, options, claimed);
				const tokens = await api.issueTokens({
					client,
					scopes: claimed.scope.split(" ").filter(Boolean),
					user: ctx.context.session.user,
					referenceId: claimed.authReqId,
					authTime: new Date(),
					accessTokenClaims: extras.accessTokenClaims,
					tokenResponse: extras.tokenResponse,
					resources: extras.resources,
				});
				void deliverPush(
					request.clientNotificationEndpoint,
					request.clientNotificationToken,
					{ auth_req_id: ctx.body.auth_req_id as string, ...tokens },
					pushRetry,
				).catch(() => {
					// Tokens are minted and the request consumed; the client must
					// re-initiate or use the refresh token if delivery fails.
				});
				return ctx.json({ status: "approved" });
			}

			await updateCibaRequest(ctx, request.id, {
				status: "approved",
				approvedAt: new Date(),
			});

			// Ping: tell the client the request is ready to be polled (best-effort).
			// Skipped on a request_id approval, which has no raw token to correlate;
			// the client still reaches the approved request on its next poll.
			if (
				request.deliveryMode === "ping" &&
				ctx.body.auth_req_id &&
				request.clientNotificationEndpoint &&
				request.clientNotificationToken
			) {
				void deliverPing(
					request.clientNotificationEndpoint,
					request.clientNotificationToken,
					ctx.body.auth_req_id,
					pushRetry,
				).catch(() => {
					// Best-effort: the client can still poll if the ping is lost.
				});
			}

			return ctx.json({ status: "approved" });
		},
	);
}

/**
 * POST /ciba/reject — the authenticated user denies a pending request. A poll or
 * ping client receives `access_denied` on its next poll; a push client is
 * notified of the denial at its notification endpoint.
 */
export function createCibaReject(options: CibaOptions) {
	const pushRetry = options.pushRetryAttempts ?? DEFAULT_PUSH_RETRY;

	return createAuthEndpoint(
		"/ciba/reject",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: approvalBody,
			metadata: {
				openapi: { description: "Reject a CIBA authentication request" },
			},
		},
		async (ctx) => {
			const request = await resolveOwnedPendingRequest(
				ctx,
				{ authReqId: ctx.body.auth_req_id, requestId: ctx.body.request_id },
				ctx.context.session.user.id,
			);
			assertPushHasRawToken(request, ctx.body.auth_req_id);

			await updateCibaRequest(ctx, request.id, { status: "rejected" });

			if (
				request.deliveryMode === "push" &&
				request.clientNotificationEndpoint &&
				request.clientNotificationToken
			) {
				void deliverError(
					request.clientNotificationEndpoint,
					request.clientNotificationToken,
					ctx.body.auth_req_id as string,
					"access_denied",
					CIBA_ERROR_CODES.ACCESS_DENIED.message,
					pushRetry,
				).catch(() => {
					// Best-effort denial notification.
				});
			}

			return ctx.json({ status: "rejected" });
		},
	);
}
