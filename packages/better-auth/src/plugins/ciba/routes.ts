import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api/routes/session";
import { generateRandomString } from "../../crypto";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CIBARequest } from "./schema";
import type { CIBAOptions } from "./types";
import { CIBA_GRANT_TYPE } from "./types";

/**
 * Generate a random auth request ID
 */
function generateAuthReqId(): string {
	return generateRandomString(32, "a-z", "A-Z", "0-9");
}

const bcAuthorizeBodySchema = z.object({
	client_id: z.string().meta({
		description: "Client/agent ID",
	}),
	client_secret: z.string().optional().meta({
		description: "Client secret (if required)",
	}),
	scope: z.string().optional().meta({
		description: "Space-separated list of scopes",
	}),
	login_hint: z.string().optional().meta({
		description: "Email or username of the user",
	}),
	id_token_hint: z.string().optional().meta({
		description: "ID token to identify the user",
	}),
	binding_message: z.string().optional().meta({
		description: "Message to display to the user",
	}),
});

const bcAuthorizeErrorSchema = z.object({
	error: z
		.enum([
			"invalid_request",
			"invalid_client",
			"unauthorized_client",
			"unknown_user_id",
			"invalid_scope",
		])
		.meta({
			description: "Error code",
		}),
	error_description: z.string().meta({
		description: "Human-readable error description",
	}),
});

/**
 * Internal options type - same structure as CIBAOptions but with required fields
 * actually filled in and optional fields kept optional
 */
type CIBAInternalOptions = {
	requestLifetime: string;
	pollingInterval: string;
	sendNotification: CIBAOptions["sendNotification"];
	resolveUser?: CIBAOptions["resolveUser"];
	validateClient?: CIBAOptions["validateClient"];
	getClientName?: CIBAOptions["getClientName"];
	baseUrl?: CIBAOptions["baseUrl"];
	onApproved?: CIBAOptions["onApproved"];
	onDenied?: CIBAOptions["onDenied"];
	schema?: CIBAOptions["schema"];
};

export const createBcAuthorizeRoute = (opts: CIBAInternalOptions) =>
	createAuthEndpoint(
		"/oauth/bc-authorize",
		{
			method: "POST",
			body: bcAuthorizeBodySchema,
			error: bcAuthorizeErrorSchema,
			metadata: {
				openapi: {
					description: `Backchannel Authentication Endpoint (CIBA)

Initiates an authentication request where the user approves asynchronously.
The agent/client initiates the request, and the user receives a notification
to approve or deny.

After calling this endpoint:
1. User receives notification (push, email, etc.)
2. User clicks approval link and authenticates
3. Agent polls /oauth/ciba-token with the auth_req_id`,
					responses: {
						200: {
							description: "Authentication request initiated",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											auth_req_id: {
												type: "string",
												description: "Unique authentication request ID",
											},
											expires_in: {
												type: "number",
												description: "Request lifetime in seconds",
											},
											interval: {
												type: "number",
												description: "Minimum polling interval in seconds",
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
			const {
				client_id,
				client_secret,
				scope,
				login_hint,
				id_token_hint,
				binding_message,
			} = ctx.body;

			// Validate client if validator provided
			if (opts.validateClient) {
				const isValid = await opts.validateClient(client_id, client_secret);
				if (!isValid) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client",
						error_description: CIBA_ERROR_CODES.INVALID_CLIENT.message,
					});
				}
			}

			// Resolve user from hints
			let resolvedUser = null;

			if (opts.resolveUser) {
				resolvedUser = await opts.resolveUser(
					{ login_hint, id_token_hint },
					{ adapter: ctx.context.adapter },
				);
			} else if (login_hint) {
				// Default: look up by email
				const result =
					await ctx.context.internalAdapter.findUserByEmail(login_hint);
				resolvedUser = result?.user ?? null;
			}

			if (!resolvedUser) {
				throw new APIError("BAD_REQUEST", {
					error: "unknown_user_id",
					error_description: CIBA_ERROR_CODES.UNKNOWN_USER.message,
				});
			}

			// Generate auth request ID
			const authReqId = generateAuthReqId();
			const expiresIn = ms(opts.requestLifetime as TimeString);
			const expiresAt = new Date(Date.now() + expiresIn);
			const interval = ms(opts.pollingInterval as TimeString);

			// Create CIBA request
			await ctx.context.adapter.create({
				model: "cibaRequest",
				data: {
					authReqId,
					clientId: client_id,
					userId: resolvedUser.id,
					scope,
					bindingMessage: binding_message,
					status: "pending",
					expiresAt,
					interval,
				},
			});

			// Build approval URLs
			const baseUrl = opts.baseUrl || ctx.context.baseURL;
			const approveUrl = `${baseUrl}/ciba/verify?auth_req_id=${authReqId}`;
			const denyUrl = `${baseUrl}/ciba/verify?auth_req_id=${authReqId}&action=deny`;

			// Get client name
			const clientName = opts.getClientName
				? await opts.getClientName(client_id)
				: client_id;

			// Send notification to user
			try {
				await opts.sendNotification(resolvedUser, {
					authReqId,
					clientId: client_id,
					clientName,
					scope,
					bindingMessage: binding_message,
					approveUrl,
					denyUrl,
					expiresAt,
				});
			} catch (error) {
				// Log but don't fail - the request is created, user might still approve
				ctx.context.logger.error("Failed to send CIBA notification:", error);
			}

			return ctx.json(
				{
					auth_req_id: authReqId,
					expires_in: Math.floor(expiresIn / 1000),
					interval: Math.floor(interval / 1000),
				},
				{
					headers: {
						"Cache-Control": "no-store",
					},
				},
			);
		},
	);

const cibaTokenBodySchema = z.object({
	grant_type: z.literal(CIBA_GRANT_TYPE).meta({
		description: "CIBA grant type",
	}),
	auth_req_id: z.string().meta({
		description: "The authentication request ID from bc-authorize",
	}),
	client_id: z.string().meta({
		description: "Client/agent ID",
	}),
	client_secret: z.string().optional().meta({
		description: "Client secret (if required)",
	}),
});

const cibaTokenErrorSchema = z.object({
	error: z
		.enum([
			"authorization_pending",
			"slow_down",
			"expired_token",
			"access_denied",
			"invalid_grant",
			"invalid_client",
		])
		.meta({
			description: "Error code",
		}),
	error_description: z.string().meta({
		description: "Human-readable error description",
	}),
});

export const createCibaTokenRoute = (opts: CIBAInternalOptions) =>
	createAuthEndpoint(
		"/oauth/ciba-token",
		{
			method: "POST",
			body: cibaTokenBodySchema,
			error: cibaTokenErrorSchema,
			metadata: {
				openapi: {
					description: `CIBA Token Endpoint

Exchange an auth_req_id for tokens after user approval.
Poll this endpoint until the user approves or denies the request.

Possible responses:
- 200: Success (user approved)
- 400 authorization_pending: User hasn't responded yet
- 400 slow_down: Polling too fast
- 400 access_denied: User denied
- 400 expired_token: Request expired`,
					responses: {
						200: {
							description: "User approved, tokens returned",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											access_token: { type: "string" },
											token_type: { type: "string" },
											expires_in: { type: "number" },
											scope: { type: "string" },
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
			const { auth_req_id, client_id, client_secret } = ctx.body;

			// Validate client
			if (opts.validateClient) {
				const isValid = await opts.validateClient(client_id, client_secret);
				if (!isValid) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client",
						error_description: CIBA_ERROR_CODES.INVALID_CLIENT.message,
					});
				}
			}

			// Find the request
			const request = await ctx.context.adapter.findOne<CIBARequest>({
				model: "cibaRequest",
				where: [{ field: "authReqId", value: auth_req_id }],
			});

			if (!request) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			// Verify client owns the request
			if (request.clientId !== client_id) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_grant",
					error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			// Check rate limiting
			if (request.lastPolledAt) {
				const timeSinceLastPoll =
					Date.now() - new Date(request.lastPolledAt).getTime();
				if (timeSinceLastPoll < request.interval) {
					throw new APIError("BAD_REQUEST", {
						error: "slow_down",
						error_description: CIBA_ERROR_CODES.SLOW_DOWN.message,
					});
				}
			}

			// Update last polled time
			await ctx.context.adapter.update({
				model: "cibaRequest",
				where: [{ field: "id", value: request.id }],
				update: { lastPolledAt: new Date() },
			});

			// Check expiration
			if (new Date(request.expiresAt) < new Date()) {
				await ctx.context.adapter.update({
					model: "cibaRequest",
					where: [{ field: "id", value: request.id }],
					update: { status: "expired" },
				});
				throw new APIError("BAD_REQUEST", {
					error: "expired_token",
					error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
				});
			}

			// Check status
			if (request.status === "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "authorization_pending",
					error_description: CIBA_ERROR_CODES.AUTHORIZATION_PENDING.message,
				});
			}

			if (request.status === "denied") {
				throw new APIError("BAD_REQUEST", {
					error: "access_denied",
					error_description: CIBA_ERROR_CODES.ACCESS_DENIED.message,
				});
			}

			if (request.status === "expired") {
				throw new APIError("BAD_REQUEST", {
					error: "expired_token",
					error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
				});
			}

			if (request.status === "approved") {
				// Get user
				const user = await ctx.context.internalAdapter.findUserById(
					request.userId,
				);

				if (!user) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description: CIBA_ERROR_CODES.USER_NOT_FOUND.message,
					});
				}

				// Create session
				const session = await ctx.context.internalAdapter.createSession(
					user.id,
				);

				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error: "server_error",
						error_description: "Failed to create session",
					});
				}

				// Set session context
				ctx.context.setNewSession({ session, user });

				// Store in secondary storage if enabled
				if (ctx.context.options.secondaryStorage) {
					await ctx.context.secondaryStorage?.set(
						session.token,
						JSON.stringify({ user, session }),
						Math.floor(
							(new Date(session.expiresAt).getTime() - Date.now()) / 1000,
						),
					);
				}

				// Delete the CIBA request
				await ctx.context.adapter.delete({
					model: "cibaRequest",
					where: [{ field: "id", value: request.id }],
				});

				return ctx.json(
					{
						access_token: session.token,
						token_type: "Bearer",
						expires_in: Math.floor(
							(new Date(session.expiresAt).getTime() - Date.now()) / 1000,
						),
						scope: request.scope || "",
					},
					{
						headers: {
							"Cache-Control": "no-store",
							Pragma: "no-cache",
						},
					},
				);
			}

			throw new APIError("INTERNAL_SERVER_ERROR", {
				error: "server_error",
				error_description: "Unexpected request status",
			});
		},
	);

// ============================================================================
// Internal endpoints for approval UI (follows device-authorization pattern)
// ============================================================================

const cibaVerifyQuerySchema = z.object({
	auth_req_id: z.string().meta({
		description: "The authentication request ID",
	}),
});

/**
 * GET /ciba/verify - Get CIBA request details for approval page
 * No auth required - just returns info about the pending request
 */
export const createCibaVerifyRoute = (opts: CIBAInternalOptions) =>
	createAuthEndpoint(
		"/ciba/verify",
		{
			method: "GET",
			query: cibaVerifyQuerySchema,
			metadata: {
				openapi: {
					description: `Get CIBA request details for approval page

Returns information about the pending request so the UI can
display what the agent is requesting. No authentication required.`,
					responses: {
						200: {
							description: "Request details",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											authReqId: { type: "string" },
											clientId: { type: "string" },
											clientName: { type: "string" },
											scope: { type: "string" },
											bindingMessage: { type: "string" },
											expiresAt: { type: "string", format: "date-time" },
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
			const { auth_req_id } = ctx.query;

			const request = await ctx.context.adapter.findOne<CIBARequest>({
				model: "cibaRequest",
				where: [{ field: "authReqId", value: auth_req_id }],
			});

			if (!request) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			if (request.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
				});
			}

			if (new Date(request.expiresAt) < new Date()) {
				throw new APIError("BAD_REQUEST", {
					error: "expired_token",
					error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
				});
			}

			const clientName = opts.getClientName
				? await opts.getClientName(request.clientId)
				: request.clientId;

			return ctx.json({
				authReqId: request.authReqId,
				clientId: request.clientId,
				clientName,
				scope: request.scope,
				bindingMessage: request.bindingMessage,
				expiresAt: request.expiresAt,
			});
		},
	);

const cibaAuthorizeBodySchema = z.object({
	authReqId: z.string().meta({
		description: "The authentication request ID to approve",
	}),
});

/**
 * POST /ciba/authorize - Approve a CIBA request
 * Requires session (user must be authenticated)
 * Follows same pattern as POST /device/approve
 */
export const createCibaAuthorizeRoute = (opts: CIBAInternalOptions) =>
	createAuthEndpoint(
		"/ciba/authorize",
		{
			method: "POST",
			body: cibaAuthorizeBodySchema,
			requireHeaders: true,
			metadata: {
				openapi: {
					description: `Approve a CIBA request

Requires the user to be authenticated (via session).
User must log in using their configured auth method before approving.
Similar to POST /device/approve in device-authorization flow.`,
					responses: {
						200: {
							description: "Request approved",
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
			// User must be authenticated
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					error: "unauthorized",
					error_description: "Authentication required",
				});
			}

			const { authReqId } = ctx.body;

			const request = await ctx.context.adapter.findOne<CIBARequest>({
				model: "cibaRequest",
				where: [{ field: "authReqId", value: authReqId }],
			});

			if (!request) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			if (request.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
				});
			}

			// Verify the authenticated user matches the request
			if (request.userId !== session.user.id) {
				throw new APIError("FORBIDDEN", {
					error: "forbidden",
					error_description: CIBA_ERROR_CODES.USER_MISMATCH.message,
				});
			}

			if (new Date(request.expiresAt) < new Date()) {
				await ctx.context.adapter.update({
					model: "cibaRequest",
					where: [{ field: "id", value: request.id }],
					update: { status: "expired" },
				});
				throw new APIError("BAD_REQUEST", {
					error: "expired_token",
					error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
				});
			}

			// Mark as approved
			await ctx.context.adapter.update({
				model: "cibaRequest",
				where: [{ field: "id", value: request.id }],
				update: {
					status: "approved",
					approvedAt: new Date(),
				},
			});

			if (opts.onApproved) {
				await opts.onApproved({
					authReqId: request.authReqId,
					userId: request.userId,
					clientId: request.clientId,
					scope: request.scope,
				});
			}

			return ctx.json({ success: true });
		},
	);

const cibaDenyBodySchema = z.object({
	authReqId: z.string().meta({
		description: "The authentication request ID to deny",
	}),
});

/**
 * POST /ciba/deny - Deny a CIBA request
 * No auth required - denial only prevents access, doesn't grant anything
 * Similar to POST /device/deny in device-authorization flow
 */
export const createCibaDenyRoute = (opts: CIBAInternalOptions) =>
	createAuthEndpoint(
		"/ciba/deny",
		{
			method: "POST",
			body: cibaDenyBodySchema,
			metadata: {
				openapi: {
					description: `Deny a CIBA request

Does not require authentication - anyone with the auth_req_id can deny.
This is safe because denial only prevents access, it doesn't grant anything.
Similar to POST /device/deny in device-authorization flow.`,
					responses: {
						200: {
							description: "Request denied",
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
			const { authReqId } = ctx.body;

			const request = await ctx.context.adapter.findOne<CIBARequest>({
				model: "cibaRequest",
				where: [{ field: "authReqId", value: authReqId }],
			});

			if (!request) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
				});
			}

			if (request.status !== "pending") {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
				});
			}

			// Mark as denied
			await ctx.context.adapter.update({
				model: "cibaRequest",
				where: [{ field: "id", value: request.id }],
				update: {
					status: "denied",
					deniedAt: new Date(),
				},
			});

			if (opts.onDenied) {
				await opts.onDenied({
					authReqId: request.authReqId,
					userId: request.userId,
					clientId: request.clientId,
				});
			}

			return ctx.json({ success: true });
		},
	);
