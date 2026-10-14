import type { GenericEndpointContext } from "@better-auth/core";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CibaRequest } from "./utils";
import { findCibaRequest, getCibaProviderApi, pingClient } from "./utils";

const authReqIdSchema = z.object({ auth_req_id: z.string().min(1) });

/**
 * Finds the request behind an approval link for its owner. A missing request and
 * one owned by another user return the same error, so a session cannot probe
 * for other users' requests.
 */
async function findOwnedRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
	userId: string,
): Promise<CibaRequest> {
	const request = await findCibaRequest(ctx, authReqId);
	if (!request || request.userId !== userId) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
		});
	}
	if (request.expiresAt < new Date()) {
		throw new APIError("BAD_REQUEST", {
			error: "expired_token",
			error_description: CIBA_ERROR_CODES.EXPIRED_AUTH_REQ_ID.message,
		});
	}
	return request;
}

/**
 * Records the user's decision on a pending request. The status filter makes the
 * transition one-way, so a concurrent approve and deny cannot both apply.
 */
async function decide(
	ctx: GenericEndpointContext,
	authReqId: string,
	session: { user: { id: string }; session: { createdAt: Date } },
	decision: "approved" | "denied",
) {
	const request = await findOwnedRequest(ctx, authReqId, session.user.id);
	const updated = await ctx.context.adapter.update<CibaRequest>({
		model: "cibaRequest",
		where: [
			{ field: "id", value: request.id },
			{ field: "status", value: "pending" },
		],
		update:
			decision === "approved"
				? {
						status: decision,
						authTime: session.session.createdAt,
					}
				: { status: decision },
	});
	if (!updated) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
		});
	}
	await pingClient(ctx, request, authReqId);
	return ctx.json({ status: decision });
}

/** GET /ciba/request: what the approval page shows the request's owner. */
export const cibaRequest = createAuthEndpoint(
	"/ciba/request",
	{
		method: "GET",
		use: [sessionMiddleware],
		query: authReqIdSchema,
		metadata: {
			noStore: true,
			openapi: {
				description: "Get a CIBA request for its approval page",
			},
		},
	},
	async (ctx) => {
		const request = await findOwnedRequest(
			ctx,
			ctx.query.auth_req_id,
			ctx.context.session.user.id,
		);
		const client = await getCibaProviderApi(ctx).getClient(request.clientId);
		return ctx.json({
			client_id: request.clientId,
			client_name: client?.name,
			scope: request.scope,
			binding_message: request.bindingMessage ?? undefined,
			resources: request.resources ?? undefined,
			status: request.status,
			expires_at: request.expiresAt.toISOString(),
		});
	},
);

/** POST /ciba/approve: the signed-in owner approves a pending request. */
export const cibaApprove = createAuthEndpoint(
	"/ciba/approve",
	{
		method: "POST",
		use: [sessionMiddleware],
		body: authReqIdSchema,
		metadata: {
			openapi: { description: "Approve a CIBA request" },
		},
	},
	(ctx) => decide(ctx, ctx.body.auth_req_id, ctx.context.session, "approved"),
);

/** POST /ciba/deny: the signed-in owner denies a pending request. */
export const cibaDeny = createAuthEndpoint(
	"/ciba/deny",
	{
		method: "POST",
		use: [sessionMiddleware],
		body: authReqIdSchema,
		metadata: {
			openapi: { description: "Deny a CIBA request" },
		},
	},
	(ctx) => decide(ctx, ctx.body.auth_req_id, ctx.context.session, "denied"),
);
