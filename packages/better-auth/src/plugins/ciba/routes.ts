import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../api/routes/session";
import { generateRandomString } from "../../crypto";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
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
	storeCibaRequest,
	updateCibaRequest,
} from "./storage";
import type { CibaInternalOptions, CibaRequestData } from "./types";

/**
 * POST /oauth/bc-authorize
 * Backchannel Authentication Request - Agent initiates auth request
 */

const bcAuthorizeBodySchema = z.object({
	client_id: z.string().optional(),
	client_secret: z.string().optional(),
	scope: z.string().default("openid"),
	login_hint: z.string(),
	binding_message: z.string().optional(),
});

export const bcAuthorize = (opts: CibaInternalOptions) =>
	createAuthEndpoint(
		"/oauth/bc-authorize",
		{
			method: "POST",
			body: bcAuthorizeBodySchema,
			metadata: {
				openapi: {
					description:
						"Initiate a CIBA (Client-Initiated Backchannel Authentication) request",
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
												description:
													"Unique identifier for the authentication request",
											},
											expires_in: {
												type: "number",
												description: "Lifetime of the auth_req_id in seconds",
											},
											interval: {
												type: "number",
												description: "Minimum polling interval in seconds",
											},
										},
										required: ["auth_req_id", "expires_in", "interval"],
									},
								},
							},
						},
						400: {
							description: "Invalid request",
						},
						401: {
							description: "Invalid client credentials",
						},
					},
				},
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
			},
		},
		async (ctx) => {
			// Check that OIDC provider is enabled
			const oidcPlugin = ctx.context.getPlugin("oidc-provider");
			if (!oidcPlugin) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					error: "server_error",
					error_description: CIBA_ERROR_CODES.OIDC_PROVIDER_REQUIRED.message,
				});
			}
			const oidcOpts = (oidcPlugin.options || {}) as OIDCOptions;
			const storeMethod: StoreClientSecretOption =
				oidcOpts.storeClientSecret ?? "plain";

			// Parse client credentials
			const credentials = parseClientCredentials(
				ctx.body as Record<string, unknown>,
				ctx.request?.headers.get("authorization") || null,
			);

			if (!credentials) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: CIBA_ERROR_CODES.INVALID_CLIENT.message,
				});
			}

			// Validate client
			const client = await getClient(credentials.clientId);
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

			// Verify client secret using proper method
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

			if (client.disabled) {
				throw new APIError("UNAUTHORIZED", {
					error: "invalid_client",
					error_description: "Client is disabled",
				});
			}

			// Validate scope includes openid
			const requestedScopes = ctx.body.scope.split(" ");
			if (!requestedScopes.includes("openid")) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_scope",
					error_description: "scope must include 'openid'",
				});
			}

			// Resolve user from login_hint
			const loginHint = ctx.body.login_hint;
			let user = null;

			if (opts.resolveUser) {
				user = await opts.resolveUser(loginHint, ctx);
			} else {
				// Default: try email, then phone, then username
				const result =
					await ctx.context.internalAdapter.findUserByEmail(loginHint);
				if (result) {
					user = "user" in result ? result.user : result;
				}

				let userId: string | null = null;

				if (!user) {
					// Try as phone number (if phone-number plugin is enabled)
					const phoneUser = await ctx.context.adapter.findOne<{ id: string }>({
						model: "user",
						where: [{ field: "phoneNumber", value: loginHint }],
					});
					if (phoneUser) {
						userId = phoneUser.id;
					}
				}

				if (!user && !userId) {
					// Try as username (if username plugin is enabled)
					const usernameUser = await ctx.context.adapter.findOne<{
						id: string;
					}>({
						model: "user",
						where: [{ field: "username", value: loginHint }],
					});
					if (usernameUser) {
						userId = usernameUser.id;
					}
				}

				// If we found a user by phone/username, look up the full user object
				if (!user && userId) {
					user = await ctx.context.internalAdapter.findUserById(userId);
				}
			}

			if (!user) {
				throw new APIError("BAD_REQUEST", {
					error: "unknown_user_id",
					error_description: CIBA_ERROR_CODES.UNKNOWN_USER_ID.message,
				});
			}

			// Generate auth_req_id
			const authReqId = generateRandomString(32, "a-z", "A-Z", "0-9");

			// Calculate expiration
			const requestLifetimeMs = ms(opts.requestLifetime as TimeString);
			const pollingIntervalMs = ms(opts.pollingInterval as TimeString);
			const expiresAt = Date.now() + requestLifetimeMs;

			// Store CIBA request
			const cibaRequest: CibaRequestData = {
				authReqId,
				clientId: credentials.clientId,
				userId: user.id,
				scope: ctx.body.scope,
				bindingMessage: ctx.body.binding_message,
				status: "pending",
				expiresAt,
				pollingInterval: pollingIntervalMs,
				createdAt: Date.now(),
			};

			await storeCibaRequest(ctx, cibaRequest);

			// Build approval URL
			const approvalUrl = new URL(opts.approvalUri, ctx.context.baseURL);
			approvalUrl.searchParams.set("auth_req_id", authReqId);

			// Send notification to user
			await ctx.context.runInBackgroundOrAwait(
				opts.sendNotification(
					{
						user,
						authReqId,
						approvalUrl: approvalUrl.toString(),
						bindingMessage: ctx.body.binding_message,
						clientId: credentials.clientId,
						scope: ctx.body.scope,
						expiresAt: new Date(expiresAt),
					},
					ctx.request,
				),
			);

			// Return response
			return ctx.json(
				{
					auth_req_id: authReqId,
					expires_in: Math.floor(requestLifetimeMs / 1000),
					interval: Math.floor(pollingIntervalMs / 1000),
				},
				{
					headers: {
						"Cache-Control": "no-store",
					},
				},
			);
		},
	);

/**
 * GET /ciba/verify
 * Get CIBA request details for the approval UI
 */

const verifyQuerySchema = z.object({
	auth_req_id: z.string(),
});

export const cibaVerify = createAuthEndpoint(
	"/ciba/verify",
	{
		method: "GET",
		query: verifyQuerySchema,
		metadata: {
			openapi: {
				description: "Get CIBA request details for the approval UI",
				responses: {
					200: {
						description: "Request details",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										auth_req_id: { type: "string" },
										client_id: { type: "string" },
										scope: { type: "string" },
										binding_message: { type: "string" },
										status: { type: "string" },
										expires_at: { type: "string" },
									},
								},
							},
						},
					},
					400: {
						description: "Invalid or expired request",
					},
				},
			},
		},
	},
	async (ctx) => {
		const { auth_req_id } = ctx.query;

		const cibaRequest = await findCibaRequest(ctx, auth_req_id);
		if (!cibaRequest) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
			});
		}

		// Check if expired
		if (cibaRequest.expiresAt < Date.now()) {
			await deleteCibaRequest(ctx, auth_req_id);
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
			});
		}

		return ctx.json({
			auth_req_id: cibaRequest.authReqId,
			client_id: cibaRequest.clientId,
			scope: cibaRequest.scope,
			binding_message: cibaRequest.bindingMessage,
			status: cibaRequest.status,
			expires_at: new Date(cibaRequest.expiresAt).toISOString(),
		});
	},
);

/**
 * POST /ciba/authorize
 * User approves the request (requires session)
 */

const authorizeBodySchema = z.object({
	auth_req_id: z.string(),
});

export const cibaAuthorize = createAuthEndpoint(
	"/ciba/authorize",
	{
		method: "POST",
		body: authorizeBodySchema,
		requireHeaders: true,
		metadata: {
			openapi: {
				description:
					"Approve a CIBA authentication request (requires user session)",
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
					401: {
						description: "User not authenticated",
					},
					400: {
						description: "Invalid request or user mismatch",
					},
				},
			},
		},
	},
	async (ctx) => {
		// Require authenticated session
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				error: "unauthorized",
				error_description: CIBA_ERROR_CODES.AUTHENTICATION_REQUIRED.message,
			});
		}

		const { auth_req_id } = ctx.body;

		const cibaRequest = await findCibaRequest(ctx, auth_req_id);
		if (!cibaRequest) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
			});
		}

		// Check if expired
		if (cibaRequest.expiresAt < Date.now()) {
			await deleteCibaRequest(ctx, auth_req_id);
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
			});
		}

		// Check if already processed
		if (cibaRequest.status !== "pending") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
			});
		}

		// Verify the authenticated user matches the requested user
		if (session.user.id !== cibaRequest.userId) {
			throw new APIError("BAD_REQUEST", {
				error: "access_denied",
				error_description: CIBA_ERROR_CODES.USER_MISMATCH.message,
			});
		}

		// Update status to approved
		await updateCibaRequest(ctx, auth_req_id, { status: "approved" });

		return ctx.json({ success: true });
	},
);

/**
 * POST /ciba/reject
 * User rejects the request (requires session)
 */

const rejectBodySchema = z.object({
	auth_req_id: z.string(),
});

export const cibaReject = createAuthEndpoint(
	"/ciba/reject",
	{
		method: "POST",
		body: rejectBodySchema,
		requireHeaders: true,
		metadata: {
			openapi: {
				description:
					"Reject a CIBA authentication request (requires user session)",
				responses: {
					200: {
						description: "Request rejected",
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
					401: {
						description: "User not authenticated",
					},
					400: {
						description: "Invalid request or user mismatch",
					},
				},
			},
		},
	},
	async (ctx) => {
		// Require authenticated session
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			throw new APIError("UNAUTHORIZED", {
				error: "unauthorized",
				error_description: CIBA_ERROR_CODES.AUTHENTICATION_REQUIRED.message,
			});
		}

		const { auth_req_id } = ctx.body;

		const cibaRequest = await findCibaRequest(ctx, auth_req_id);
		if (!cibaRequest) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: CIBA_ERROR_CODES.INVALID_AUTH_REQ_ID.message,
			});
		}

		// Check if expired
		if (cibaRequest.expiresAt < Date.now()) {
			await deleteCibaRequest(ctx, auth_req_id);
			throw new APIError("BAD_REQUEST", {
				error: "expired_token",
				error_description: CIBA_ERROR_CODES.EXPIRED_TOKEN.message,
			});
		}

		// Check if already processed
		if (cibaRequest.status !== "pending") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: CIBA_ERROR_CODES.REQUEST_ALREADY_PROCESSED.message,
			});
		}

		// Verify the authenticated user matches the requested user
		if (session.user.id !== cibaRequest.userId) {
			throw new APIError("BAD_REQUEST", {
				error: "access_denied",
				error_description: CIBA_ERROR_CODES.USER_MISMATCH.message,
			});
		}

		// Update status to rejected
		await updateCibaRequest(ctx, auth_req_id, { status: "rejected" });

		return ctx.json({ success: true });
	},
);
