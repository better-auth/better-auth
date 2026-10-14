import type { GenericEndpointContext } from "@better-auth/core";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import * as z from "zod";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CibaDecision, CibaOptions } from "./types";
import type { CibaRequestIdentifier, StoredCibaRequest } from "./utils";
import { findCibaRequest, getCibaProviderApi, pingClient } from "./utils";

type IdentifierInput = {
	auth_req_id?: string | undefined;
	request_id?: string | undefined;
};

const identifierShape = {
	auth_req_id: z.string().min(1).optional(),
	request_id: z.string().min(1).optional(),
};
const EXACTLY_ONE = "Provide exactly one of auth_req_id or request_id";
const hasOneIdentifier = (input: IdentifierInput) =>
	Boolean(input.auth_req_id) !== Boolean(input.request_id);
const identifierSchema = z
	.object(identifierShape)
	.refine(hasOneIdentifier, EXACTLY_ONE);

function toIdentifier(input: IdentifierInput): CibaRequestIdentifier {
	return input.request_id
		? { requestId: input.request_id }
		: { authReqId: input.auth_req_id as string };
}

function unknownRequest(): APIError {
	return new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
	});
}

/**
 * Finds a request for its owner. A missing request and one owned by another
 * user return the same error, so a session cannot probe for other users'
 * requests.
 */
async function findOwnedRequest(
	ctx: GenericEndpointContext,
	input: IdentifierInput,
	userId: string,
): Promise<StoredCibaRequest> {
	const request = await findCibaRequest(ctx, toIdentifier(input));
	if (!request || request.userId !== userId) throw unknownRequest();
	return request;
}

/**
 * Records a decision on a pending request, then pings a ping-mode client. The
 * status guard makes the transition one-way, so concurrent decisions cannot
 * both apply. Every completion path, by session or by server, runs here.
 */
async function completeRequest(
	ctx: GenericEndpointContext,
	request: StoredCibaRequest,
	decision: CibaDecision,
	fields: Record<string, unknown> = {},
): Promise<{ status: CibaDecision }> {
	const expired = () =>
		new APIError("BAD_REQUEST", {
			error: "expired_token",
			error_description: CIBA_ERROR_CODES.EXPIRED_AUTH_REQ_ID.message,
		});
	if (request.expiresAt < new Date()) throw expired();
	// Expiry is part of the guard, so a request cannot expire between the check
	// above and the write.
	const updated = await ctx.context.adapter.incrementOne<StoredCibaRequest>({
		model: "cibaRequest",
		where: [
			{ field: "id", value: request.id },
			{ field: "status", value: "pending" },
			{ field: "expiresAt", operator: "gt", value: new Date() },
		],
		increment: {},
		set: { ...fields, status: decision },
	});
	if (!updated) {
		if (request.status === "pending" && request.expiresAt <= new Date()) {
			throw expired();
		}
		throw new APIError("BAD_REQUEST", {
			error: "invalid_request",
			error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
		});
	}
	await pingClient(ctx, request);
	return { status: decision };
}

/** What an approval UI shows. It never includes the `auth_req_id`. */
async function describeRequest(
	ctx: GenericEndpointContext,
	request: StoredCibaRequest,
) {
	const client = await getCibaProviderApi(ctx).getClient(request.clientId);
	return {
		request_id: request.id,
		client_id: request.clientId,
		client_name: client?.name,
		scope: request.scope,
		binding_message: request.bindingMessage ?? undefined,
		acr_values: request.acrValues ?? undefined,
		authorization_details: request.authorizationDetails ?? undefined,
		resources: request.resources ?? undefined,
		status: request.status,
		expires_at: request.expiresAt.toISOString(),
	};
}

async function decideBySession(
	ctx: GenericEndpointContext & {
		context: {
			session: { user: { id: string }; session: { createdAt: Date } };
		};
	},
	input: IdentifierInput,
	decision: CibaDecision,
) {
	const { session } = ctx.context;
	const request = await findOwnedRequest(ctx, input, session.user.id);
	return completeRequest(
		ctx,
		request,
		decision,
		decision === "approved" ? { authTime: session.session.createdAt } : {},
	);
}

export function createApprovalEndpoints(options: CibaOptions) {
	const additionalFieldNames = new Set(
		Object.keys(options.schema?.cibaRequest?.additionalFields ?? {}),
	);

	return {
		/** GET /ciba/requests: the signed-in user's pending requests. */
		cibaRequests: createAuthEndpoint(
			"/ciba/requests",
			{
				method: "GET",
				use: [sessionMiddleware],
				metadata: {
					noStore: true,
					openapi: { description: "List the user's pending CIBA requests" },
				},
			},
			async (ctx) => {
				const requests = await ctx.context.adapter.findMany<StoredCibaRequest>({
					model: "cibaRequest",
					where: [
						{ field: "userId", value: ctx.context.session.user.id },
						{ field: "status", value: "pending" },
						{ field: "expiresAt", operator: "gt", value: new Date() },
					],
					sortBy: { field: "createdAt", direction: "desc" },
				});
				return ctx.json(
					await Promise.all(
						requests.map((request) => describeRequest(ctx, request)),
					),
				);
			},
		),

		/** GET /ciba/request: one request, for its owner's approval page. */
		cibaRequest: createAuthEndpoint(
			"/ciba/request",
			{
				method: "GET",
				use: [sessionMiddleware],
				query: identifierSchema,
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
					ctx.query,
					ctx.context.session.user.id,
				);
				if (request.expiresAt < new Date()) throw unknownRequest();
				return ctx.json(await describeRequest(ctx, request));
			},
		),

		/** POST /ciba/approve: the signed-in owner approves a pending request. */
		cibaApprove: createAuthEndpoint(
			"/ciba/approve",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: identifierSchema,
				metadata: { openapi: { description: "Approve a CIBA request" } },
			},
			async (ctx) => ctx.json(await decideBySession(ctx, ctx.body, "approved")),
		),

		/** POST /ciba/deny: the signed-in owner denies a pending request. */
		cibaDeny: createAuthEndpoint(
			"/ciba/deny",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: identifierSchema,
				metadata: { openapi: { description: "Deny a CIBA request" } },
			},
			async (ctx) => ctx.json(await decideBySession(ctx, ctx.body, "denied")),
		),

		/**
		 * Server-only completion for trusted code, such as approval by policy. It
		 * runs the same path as the session endpoints, so a ping-mode client is
		 * pinged.
		 */
		completeCibaRequest: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: z
					.object({
						...identifierShape,
						decision: z.enum(["approved", "denied"]),
						// When the user authenticated; issued as `auth_time`.
						authTime: z.coerce.date().optional(),
						// Values for the deployment's `additionalFields`.
						additionalFields: z.record(z.string(), z.unknown()).optional(),
					})
					.refine(hasOneIdentifier, EXACTLY_ONE),
			},
			async (ctx) => {
				const request = await findCibaRequest(ctx, toIdentifier(ctx.body));
				if (!request) throw unknownRequest();
				const additionalFields = ctx.body.additionalFields ?? {};
				const undeclared = Object.keys(additionalFields).filter(
					(name) => !additionalFieldNames.has(name),
				);
				if (undeclared.length > 0) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description: `Undeclared additionalFields: ${undeclared.join(", ")}`,
					});
				}
				const authTime =
					ctx.body.decision === "approved" && ctx.body.authTime
						? { authTime: ctx.body.authTime }
						: {};
				return ctx.json(
					await completeRequest(ctx, request, ctx.body.decision, {
						...additionalFields,
						...authTime,
					}),
				);
			},
		),
	};
}
