import { ResourceUriSchema } from "@better-auth/oauth-provider";
import {
	createOAuthEndpoint,
	resolveResourcePolicy,
	toResourceList,
} from "@better-auth/oauth-provider/internal";
import { APIError } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import { BC_AUTHORIZE_PATH } from "./constants";
import { CIBA_ERROR_CODES } from "./error-codes";
import type { CibaDeliveryMode, CibaOptions } from "./types";
import {
	getCibaClientMetadata,
	getCibaProviderApi,
	getOAuthOptions,
	hashAuthReqId,
	isSupportedDeliveryMode,
} from "./utils";

// C0 controls plus DEL: a binding message must be short plain text (CIBA §7.1).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

function invalidRequest(
	description: string,
	error = "invalid_request",
): APIError {
	return new APIError("BAD_REQUEST", {
		error,
		error_description: description,
	});
}

export function createBcAuthorize(
	options: CibaOptions,
	settings: {
		deliveryModes: CibaDeliveryMode[];
		expiresIn: number;
		interval: number;
	},
) {
	return createOAuthEndpoint(
		BC_AUTHORIZE_PATH,
		{
			method: "POST",
			body: z.object({
				// Client authentication (CIBA §7.1 requires it).
				client_id: z.string().optional(),
				client_secret: z.string().optional(),
				client_assertion: z.string().optional(),
				client_assertion_type: z.string().optional(),
				scope: z.string(),
				// All three hints are modeled so the exactly-one rule (CIBA §7.1) is
				// enforced; only login_hint is implemented.
				login_hint: z.string().optional(),
				id_token_hint: z.string().optional(),
				login_hint_token: z.string().optional(),
				binding_message: z.string().max(256).optional(),
				client_notification_token: z.string().max(1024).optional(),
				requested_expiry: z.coerce.number().int().positive().optional(),
				resource: z
					.union([ResourceUriSchema, z.array(ResourceUriSchema).min(1)])
					.optional(),
			}),
			// Re-reads the raw form: repeated parameters are rejected (RFC 6749
			// §3.2) except RFC 8707 `resource`, and client authentication reads the
			// body again.
			formParams: { repeatable: ["resource"] },
			// Validation failures use the CIBA §13 error envelope.
			errorCodesByField: {
				binding_message: "invalid_binding_message",
				resource: { invalid: "invalid_target" },
			},
			metadata: {
				noStore: true,
				// CIBA §7.1: the request is form-encoded.
				allowedMediaTypes: ["application/x-www-form-urlencoded"],
				openapi: {
					description: "Start a CIBA backchannel authentication request",
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
			const scopes = ctx.body.scope.split(" ").filter(Boolean);
			// Authenticate first, so an unauthenticated caller cannot probe request
			// validation. The bound grant type enforces CIBA registration.
			const { client, clientId } = await getCibaProviderApi(
				ctx,
			).authenticateClient({ scopes, requireCredentials: true });

			const { deliveryMode, notificationEndpoint } =
				getCibaClientMetadata(client);
			if (!isSupportedDeliveryMode(deliveryMode, settings.deliveryModes)) {
				throw invalidRequest(
					CIBA_ERROR_CODES.UNSUPPORTED_DELIVERY_MODE.message,
				);
			}
			if (deliveryMode === "ping") {
				if (!ctx.body.client_notification_token) {
					throw invalidRequest(
						CIBA_ERROR_CODES.NOTIFICATION_TOKEN_REQUIRED.message,
					);
				}
				if (!notificationEndpoint) {
					throw invalidRequest(
						CIBA_ERROR_CODES.INVALID_NOTIFICATION_ENDPOINT.message,
					);
				}
			}

			if (!scopes.includes("openid")) {
				throw invalidRequest(
					CIBA_ERROR_CODES.INVALID_SCOPE.message,
					"invalid_scope",
				);
			}
			if (
				ctx.body.binding_message &&
				CONTROL_CHARS.test(ctx.body.binding_message)
			) {
				throw invalidRequest(
					CIBA_ERROR_CODES.INVALID_BINDING_MESSAGE.message,
					"invalid_binding_message",
				);
			}

			const hints = [
				ctx.body.login_hint,
				ctx.body.id_token_hint,
				ctx.body.login_hint_token,
			].filter(Boolean);
			if (hints.length !== 1) {
				throw invalidRequest(CIBA_ERROR_CODES.EXACTLY_ONE_HINT.message);
			}
			const loginHint = ctx.body.login_hint;
			if (!loginHint) {
				throw invalidRequest(CIBA_ERROR_CODES.UNSUPPORTED_HINT.message);
			}

			const resources = toResourceList(ctx.body.resource);
			await resolveResourcePolicy(ctx, getOAuthOptions(ctx), {
				resource: resources,
				clientId,
				requestedScopes: scopes,
			});

			const user = options.resolveUser
				? await options.resolveUser(loginHint, ctx)
				: ((await ctx.context.internalAdapter.findUserByEmail(loginHint))
						?.user ?? null);
			if (!user) {
				throw invalidRequest(
					CIBA_ERROR_CODES.UNKNOWN_USER_ID.message,
					"unknown_user_id",
				);
			}

			const expiresIn = Math.min(
				ctx.body.requested_expiry ?? settings.expiresIn,
				settings.expiresIn,
			);
			const authReqId = generateRandomString(32, "a-z", "A-Z", "0-9");
			await ctx.context.adapter.create({
				model: "cibaRequest",
				data: {
					authReqId: await hashAuthReqId(ctx, authReqId),
					clientId,
					userId: user.id,
					scope: scopes.join(" "),
					bindingMessage: ctx.body.binding_message,
					resources: resources ?? null,
					status: "pending",
					clientNotificationToken:
						deliveryMode === "ping"
							? ctx.body.client_notification_token
							: undefined,
					pollingInterval: settings.interval * 1000,
					expiresAt: new Date(Date.now() + expiresIn * 1000),
					createdAt: new Date(),
				},
			});

			const approvalUrl = new URL(options.approvalPage, ctx.context.baseURL);
			approvalUrl.searchParams.set("auth_req_id", authReqId);
			await ctx.context.runInBackgroundOrAwait(
				options.sendNotification(
					{
						userId: user.id,
						clientId,
						clientName: client.name,
						scope: scopes.join(" "),
						bindingMessage: ctx.body.binding_message,
						approvalUrl: approvalUrl.toString(),
					},
					ctx,
				),
			);

			return ctx.json({
				auth_req_id: authReqId,
				expires_in: expiresIn,
				interval: settings.interval,
			});
		},
	);
}
