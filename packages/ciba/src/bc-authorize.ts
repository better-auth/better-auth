import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import {
	ALL_DELIVERY_MODES,
	BC_AUTHORIZE_PATH,
	CIBA_GRANT_TYPE,
	DEFAULT_POLLING_INTERVAL,
	DEFAULT_REQUEST_EXPIRY,
} from "./constants";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CibaOptions } from "./types";
import type { CibaDeliveryMode } from "./utils";
import {
	generateAuthReqId,
	getClientDeliveryMode,
	getOAuthOptions,
	hashAuthReqId,
	isSecureEndpoint,
} from "./utils";

// C0 controls plus DEL: a binding message must be short plain text (CIBA §7.1).
// Built from an escaped string so the source carries no literal control bytes.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

export function createBcAuthorize(options: CibaOptions) {
	const requestExpiry = options.requestExpiry ?? DEFAULT_REQUEST_EXPIRY;
	const pollingInterval = options.pollingInterval ?? DEFAULT_POLLING_INTERVAL;
	const supportedModes: CibaDeliveryMode[] = options.deliveryModes ?? ["poll"];

	return createAuthEndpoint(
		BC_AUTHORIZE_PATH,
		{
			method: "POST",
			body: z.object({
				client_id: z.string().optional(),
				client_secret: z.string().optional(),
				scope: z.string().min(1),
				// All three hints are modeled so the exactly-one rule (CIBA §7.1) is
				// enforced. Only login_hint is implemented; the others are rejected
				// explicitly rather than silently dropped.
				login_hint: z.string().optional(),
				id_token_hint: z.string().optional(),
				login_hint_token: z.string().optional(),
				binding_message: z.string().max(256).optional(),
				// RFC 9396 RAR, RFC 8707 resource indicator, and OIDC step-up.
				authorization_details: z.string().optional(),
				resource: z.string().optional(),
				acr_values: z.string().optional(),
				// Ping/push delivery (CIBA §7.1).
				client_notification_token: z.string().optional(),
				client_notification_uri: z.string().url().optional(),
				requested_expiry: z.coerce.number().int().positive().optional(),
			}),
			metadata: {
				// Response carries the auth_req_id credential: no-store on success
				// and on every error response.
				noStore: true,
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					description: "Initiate a CIBA backchannel authentication request",
					responses: {
						"200": {
							description: "Authentication request accepted",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											auth_req_id: { type: "string" },
											expires_in: { type: "number" },
											interval: { type: "number" },
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
			const oauthOpts = getOAuthOptions(ctx);
			const scopes = ctx.body.scope.split(" ").filter(Boolean);

			// Authenticate the client first, so an unauthenticated caller cannot
			// probe request-shape validation. Enforces CIBA-grant registration and
			// rejects public clients unless the deployment opts in.
			const { client, clientId } = await getOAuthProviderApi(
				ctx,
				oauthOpts,
				CIBA_GRANT_TYPE,
			).authenticateClient({
				scopes,
				requireCredentials: options.requireConfidentialClient !== false,
			});

			// CIBA §4: the delivery mode is a registered client property. The client
			// must register one mode the deployment supports; an unregistered or
			// unsupported mode is rejected.
			const registeredMode = getClientDeliveryMode(client) as
				| CibaDeliveryMode
				| undefined;
			if (
				!registeredMode ||
				!supportedModes.includes(registeredMode) ||
				!ALL_DELIVERY_MODES.includes(registeredMode)
			) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.UNSUPPORTED_DELIVERY_MODE.message,
				});
			}

			if (!scopes.includes("openid")) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_scope",
					error_description: CIBA_ERROR_CODES.INVALID_SCOPE.message,
				});
			}

			if (
				ctx.body.binding_message &&
				CONTROL_CHARS.test(ctx.body.binding_message)
			) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_binding_message",
					error_description: CIBA_ERROR_CODES.INVALID_BINDING_MESSAGE.message,
				});
			}

			// Exactly one hint (CIBA §7.1/§7.2). Multiple or none is invalid_request.
			const hints = {
				login_hint: ctx.body.login_hint,
				id_token_hint: ctx.body.id_token_hint,
				login_hint_token: ctx.body.login_hint_token,
			};
			const presentHints = Object.entries(hints).filter(([, v]) => v);
			if (presentHints.length !== 1) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.EXACTLY_ONE_HINT.message,
				});
			}
			if (!ctx.body.login_hint) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_request",
					error_description: CIBA_ERROR_CODES.UNSUPPORTED_HINT.message,
				});
			}

			// Validate RAR JSON now, so a malformed value is rejected at request
			// time rather than silently dropped at issuance.
			let parsedAuthorizationDetails: unknown;
			if (ctx.body.authorization_details) {
				try {
					parsedAuthorizationDetails = JSON.parse(
						ctx.body.authorization_details,
					);
				} catch {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description: "authorization_details must be valid JSON",
					});
				}
			}

			// Ping/push need a notification endpoint and token (CIBA §7.1). Resolve
			// the endpoint from the request or the deployment, and require TLS.
			let notificationEndpoint: string | undefined;
			if (registeredMode === "ping" || registeredMode === "push") {
				notificationEndpoint =
					ctx.body.client_notification_uri ??
					(options.resolveClientNotificationEndpoint
						? await options.resolveClientNotificationEndpoint(clientId, ctx)
						: undefined);
				if (!ctx.body.client_notification_token) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description:
							"client_notification_token is required for ping/push delivery",
					});
				}
				if (!notificationEndpoint) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description:
							"A client notification endpoint is required for ping/push delivery",
					});
				}
				if (!isSecureEndpoint(notificationEndpoint)) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_request",
						error_description:
							"client_notification_uri must use HTTPS (CIBA §10.2)",
					});
				}
			}

			const user = options.resolveUser
				? await options.resolveUser(ctx.body.login_hint, ctx)
				: ((
						await ctx.context.internalAdapter.findUserByEmail(
							ctx.body.login_hint,
						)
					)?.user ?? null);
			if (!user) {
				throw new APIError("BAD_REQUEST", {
					error: "unknown_user_id",
					error_description: CIBA_ERROR_CODES.UNKNOWN_USER_ID.message,
				});
			}

			const expiresIn = ctx.body.requested_expiry
				? Math.min(ctx.body.requested_expiry, requestExpiry)
				: requestExpiry;

			const authReqId = generateAuthReqId();
			await ctx.context.adapter.create({
				model: "cibaRequest",
				data: {
					authReqId: await hashAuthReqId(authReqId),
					clientId,
					userId: user.id,
					scope: ctx.body.scope,
					bindingMessage: ctx.body.binding_message,
					authorizationDetails: ctx.body.authorization_details,
					resource: ctx.body.resource,
					acrValues: ctx.body.acr_values,
					status: "pending",
					deliveryMode: registeredMode,
					clientNotificationToken: ctx.body.client_notification_token,
					clientNotificationEndpoint: notificationEndpoint,
					pollingInterval,
					expiresAt: new Date(Date.now() + expiresIn * 1000),
					createdAt: new Date(),
				},
			});

			const approvalUrl = new URL(options.approvalPage, ctx.context.baseURL);
			approvalUrl.searchParams.set("auth_req_id", authReqId);
			try {
				await options.sendNotification(
					{
						userId: user.id,
						clientId,
						clientName: client.name,
						scope: ctx.body.scope,
						bindingMessage: ctx.body.binding_message,
						authorizationDetails: parsedAuthorizationDetails,
						acrValues: ctx.body.acr_values,
						approvalUrl: approvalUrl.toString(),
						attestationJwt:
							ctx.request?.headers.get("OAuth-Client-Attestation") ?? undefined,
						attestationPopJwt:
							ctx.request?.headers.get("OAuth-Client-Attestation-PoP") ??
							undefined,
					},
					ctx.request,
				);
			} catch (error) {
				// Log the message only; the raw provider error can carry the
				// recipient address or response body.
				ctx.context.logger?.error(
					`CIBA sendNotification failed; the request is still pending: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}

			// Push mode omits the polling interval: the client waits for delivery
			// rather than polling (CIBA §7.3).
			const response: Record<string, unknown> = {
				auth_req_id: authReqId,
				expires_in: expiresIn,
			};
			if (registeredMode !== "push") {
				response.interval = pollingInterval;
			}
			return ctx.json(response);
		},
	);
}
