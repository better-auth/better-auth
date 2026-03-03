import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { jwtVerify } from "jose";
import * as z from "zod";
import { getSessionFromCtx } from "../../api/routes/session";
import { generateRandomString } from "../../crypto";
import type { TimeString } from "../../utils/time";
import { ms } from "../../utils/time";
import { verifyJWT } from "../jwt";
import type { OIDCOptions } from "../oidc-provider/types";
import { getOidcPluginContext, validateClientCredentials } from "./client-auth";
import { CIBA_ERROR_CODES } from "./error-codes";
import { pushTokensToClient } from "./push-delivery";
import {
	deleteCibaRequest,
	findCibaRequest,
	storeCibaRequest,
	updateCibaRequest,
} from "./storage";
import type {
	CibaDeliveryMode,
	CibaInternalOptions,
	CibaRequestData,
} from "./types";

/**
 * POST /oauth/bc-authorize
 * Backchannel Authentication Request - Agent initiates auth request
 */

const bcAuthorizeBodySchema = z
	.object({
		client_id: z.string().optional(),
		client_secret: z.string().optional(),
		scope: z.string().default("openid"),
		login_hint: z.string().optional(),
		id_token_hint: z.string().optional(),
		binding_message: z.string().optional(),
		client_notification_token: z.string().optional(),
	})
	.refine((data) => !!data.login_hint !== !!data.id_token_hint, {
		message:
			"Exactly one of login_hint or id_token_hint must be provided (CIBA spec §7.1)",
		path: ["login_hint"],
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
												description:
													"Minimum polling interval in seconds (poll mode only)",
											},
										},
										required: ["auth_req_id", "expires_in"],
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
			const pluginContext = getOidcPluginContext(ctx);
			const { client, credentials } = await validateClientCredentials(
				ctx,
				ctx.body as Record<string, unknown>,
				pluginContext,
			);

			// Validate scope includes openid
			const requestedScopes = ctx.body.scope.split(" ");
			if (!requestedScopes.includes("openid")) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_scope",
					error_description: "scope must include 'openid'",
				});
			}

			// Determine delivery mode from client metadata
			const clientMetadata: Record<string, unknown> =
				typeof client.metadata === "string"
					? JSON.parse(client.metadata)
					: (client.metadata ?? {});

			let deliveryMode: CibaDeliveryMode = opts.deliveryMode;
			let clientNotificationEndpoint: string | undefined;

			if (clientMetadata.backchannel_token_delivery_mode === "push") {
				deliveryMode = "push";
			}
			if (typeof clientMetadata.client_notification_endpoint === "string") {
				clientNotificationEndpoint =
					clientMetadata.client_notification_endpoint;
			}

			// Validate push mode requirements
			if (deliveryMode === "push") {
				if (!clientNotificationEndpoint) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description:
							CIBA_ERROR_CODES.MISSING_NOTIFICATION_ENDPOINT.message,
					});
				}
				// CIBA spec §10.3: notification endpoint MUST use TLS.
				// Loopback addresses are exempt (standard for local development).
				try {
					const endpointUrl = new URL(clientNotificationEndpoint);
					const isLoopback =
						endpointUrl.hostname === "localhost" ||
						endpointUrl.hostname === "127.0.0.1" ||
						endpointUrl.hostname === "::1";
					if (endpointUrl.protocol !== "https:" && !isLoopback) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description:
								"client_notification_endpoint must use HTTPS per CIBA spec §10.3",
						});
					}
				} catch (e) {
					if (e instanceof APIError) throw e;
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description:
							"client_notification_endpoint is not a valid URL",
					});
				}
				if (!ctx.body.client_notification_token) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description:
							CIBA_ERROR_CODES.MISSING_NOTIFICATION_TOKEN.message,
					});
				}
			}

			// Resolve user from login_hint or id_token_hint
			let user = null;

			if (ctx.body.id_token_hint) {
				// Verify the ID token and extract the subject
				const oidcOpts = pluginContext.oidcOpts as OIDCOptions;
				let validatedUserId: string | null = null;

				try {
					if (oidcOpts.useJWTPlugin) {
						const jwtPlugin = ctx.context.getPlugin("jwt");
						if (jwtPlugin?.options) {
							const verified = await verifyJWT(
								ctx.body.id_token_hint,
								jwtPlugin.options,
							);
							if (verified?.sub) {
								validatedUserId = verified.sub;
							}
						}
					} else {
						// HS256 fallback — verify with the server secret
						const { payload } = await jwtVerify(
							ctx.body.id_token_hint,
							new TextEncoder().encode(ctx.context.secret),
						);
						if (payload.sub) {
							validatedUserId = payload.sub as string;
						}
					}
				} catch {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description: "id_token_hint is invalid or expired",
					});
				}

				if (!validatedUserId) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description: "id_token_hint does not contain a valid subject",
					});
				}

				// Verify the token was issued to this client
				try {
					const decoded = JSON.parse(
						new TextDecoder().decode(
							Uint8Array.from(
								atob(ctx.body.id_token_hint.split(".")[1]!),
								(c) => c.charCodeAt(0),
							),
						),
					);
					if (decoded.aud && decoded.aud !== credentials.clientId) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_request",
							error_description:
								"id_token_hint audience does not match client_id",
						});
					}
				} catch (e) {
					if (e instanceof APIError) throw e;
					// If we can't decode the payload, the token was already verified above
				}

				user = await ctx.context.internalAdapter.findUserById(validatedUserId);
			} else {
				const loginHint = ctx.body.login_hint!;

				if (opts.resolveUser) {
					user = await opts.resolveUser(loginHint, ctx);
				} else {
					const result =
						await ctx.context.internalAdapter.findUserByEmail(loginHint);
					if (result) {
						user = "user" in result ? result.user : result;
					}

					let userId: string | null = null;

					if (!user) {
						try {
							const phoneUser = await ctx.context.adapter.findOne<{
								id: string;
							}>({
								model: "user",
								where: [{ field: "phoneNumber", value: loginHint }],
							});
							if (phoneUser) {
								userId = phoneUser.id;
							}
						} catch {
							// Phone number field doesn't exist, skip
						}
					}

					if (!user && !userId) {
						try {
							const usernameUser = await ctx.context.adapter.findOne<{
								id: string;
							}>({
								model: "user",
								where: [{ field: "username", value: loginHint }],
							});
							if (usernameUser) {
								userId = usernameUser.id;
							}
						} catch {
							// Username field doesn't exist, skip
						}
					}

					if (!user && userId) {
						user = await ctx.context.internalAdapter.findUserById(userId);
					}
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
				deliveryMode,
				clientNotificationToken: ctx.body.client_notification_token,
				clientNotificationEndpoint,
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
			// Per CIBA spec: interval is only returned for poll mode
			return ctx.json(
				{
					auth_req_id: authReqId,
					expires_in: Math.floor(requestLifetimeMs / 1000),
					interval:
						deliveryMode === "poll"
							? Math.floor(pollingIntervalMs / 1000)
							: undefined,
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
 * Get CIBA request details for the approval UI.
 *
 * Security note: This endpoint is intentionally unauthenticated. The
 * auth_req_id acts as an unguessable bearer token (32 cryptographically
 * random alphanumeric characters ≈ 190 bits of entropy). This is consistent
 * with CIBA spec — the auth_req_id is a secret shared between the AS and
 * the client, and this endpoint only exposes non-sensitive metadata
 * (client_id, scope, binding_message, status). No tokens or user PII
 * beyond what the client already knows are returned.
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
 * For push mode: triggers token delivery to client's notification endpoint
 */

const authorizeBodySchema = z.object({
	auth_req_id: z.string(),
});

export const cibaAuthorize = (opts: CibaInternalOptions) =>
	createAuthEndpoint(
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

			// For push mode: generate and deliver tokens to client
			const deliveryMode = cibaRequest.deliveryMode ?? "poll";
			if (deliveryMode === "push") {
				await ctx.context.runInBackgroundOrAwait(
					pushTokensToClient(ctx, cibaRequest),
				);
			}

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
