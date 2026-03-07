import type { GenericEndpointContext } from "@better-auth/core";
import {
	basicToClientCredentials,
	validateClientCredentials,
} from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { importJWK, jwtVerify } from "jose";
import * as z from "zod";
import type { CibaOptions } from "./types";
import { getOAuthOpts, isSecureEndpoint } from "./utils";

export function createBcAuthorize(options: CibaOptions) {
	const deliveryModes = options.deliveryModes ?? ["poll"];
	const requestLifetime = options.requestLifetime ?? 300;
	const pollingInterval = options.pollingInterval ?? 5;
	const approvalPage = options.approvalPage ?? "/ciba/approve";

	return createAuthEndpoint(
		"/oauth2/bc-authorize",
		{
			method: "POST",
			body: z.object({
				client_id: z.string().optional(),
				client_secret: z.string().optional(),
				scope: z.string().min(1),
				login_hint: z.string().optional(),
				id_token_hint: z.string().optional(),
				login_hint_token: z.string().optional(),
				binding_message: z.string().max(256).optional(),
				client_notification_token: z.string().optional(),
				client_notification_uri: z.string().url().optional(),
				authorization_details: z.string().optional(),
				resource: z.string().optional(),
				requested_expiry: z.coerce.number().int().positive().optional(),
			}),
			metadata: {
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					description: "Initiate a CIBA backchannel authentication request",
					responses: {
						200: {
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
			const oauthOpts = getOAuthOpts(ctx);

			let clientId = ctx.body.client_id;
			let clientSecret = ctx.body.client_secret;

			const authorization = ctx.request?.headers.get("authorization") || null;
			if (authorization?.startsWith("Basic ")) {
				const res = basicToClientCredentials(authorization);
				clientId = res?.client_id;
				clientSecret = res?.client_secret;
			}

			if (!clientId) {
				throw new APIError("BAD_REQUEST", {
					error_description: "client_id is required",
					error: "invalid_request",
				});
			}

			const scopes = ctx.body.scope.split(" ");
			if (!scopes.includes("openid")) {
				throw new APIError("BAD_REQUEST", {
					error_description: 'scope must include "openid" for CIBA requests',
					error: "invalid_scope",
				});
			}

			const client = await validateClientCredentials(
				ctx as unknown as GenericEndpointContext,
				oauthOpts,
				clientId,
				clientSecret,
				scopes,
			);

			// Validate exactly one hint (CIBA §7.1)
			const hints = [
				ctx.body.login_hint,
				ctx.body.id_token_hint,
				ctx.body.login_hint_token,
			].filter(Boolean);
			if (hints.length !== 1) {
				throw new APIError("BAD_REQUEST", {
					error_description:
						"Exactly one of login_hint, id_token_hint, or login_hint_token is required",
					error: "invalid_request",
				});
			}

			let user: { id: string } | null = null;

			if (ctx.body.id_token_hint) {
				user = await resolveUserFromIdTokenHint(
					ctx,
					ctx.body.id_token_hint,
					clientId,
				);
			} else {
				const loginHint = ctx.body.login_hint || ctx.body.login_hint_token!;

				if (options.resolveUser) {
					user = await options.resolveUser(
						loginHint,
						ctx as unknown as GenericEndpointContext,
					);
				} else {
					const found =
						await ctx.context.internalAdapter.findUserByEmail(loginHint);
					user = found?.user ?? null;
				}
			}

			if (!user) {
				throw new APIError("BAD_REQUEST", {
					error_description:
						"The user identified by the hint could not be found",
					error: "unknown_user_id",
				});
			}

			const notificationEndpoint =
				ctx.body.client_notification_uri ??
				(options.resolveClientNotificationEndpoint
					? await options.resolveClientNotificationEndpoint(
							clientId,
							ctx as unknown as GenericEndpointContext,
						)
					: undefined);

			let mode: "poll" | "ping" | "push" = "poll";
			if (ctx.body.client_notification_token && notificationEndpoint) {
				if (deliveryModes.includes("push")) mode = "push";
				else if (deliveryModes.includes("ping")) mode = "ping";
			}

			if (mode === "push" || mode === "ping") {
				if (!ctx.body.client_notification_token) {
					throw new APIError("BAD_REQUEST", {
						error_description:
							"client_notification_token is required for push/ping delivery modes",
						error: "invalid_request",
					});
				}
				if (!notificationEndpoint) {
					throw new APIError("BAD_REQUEST", {
						error_description:
							"A client notification endpoint is required for push/ping delivery (provide client_notification_uri or configure resolveClientNotificationEndpoint)",
						error: "invalid_request",
					});
				}
				// CIBA §10.3: notification endpoint MUST use TLS
				if (!isSecureEndpoint(notificationEndpoint)) {
					throw new APIError("BAD_REQUEST", {
						error_description:
							"client_notification_endpoint must use HTTPS (CIBA §10.3)",
						error: "invalid_request",
					});
				}
			}

			let parsedAuthorizationDetails: unknown;
			if (ctx.body.authorization_details) {
				try {
					parsedAuthorizationDetails = JSON.parse(
						ctx.body.authorization_details,
					);
				} catch {
					throw new APIError("BAD_REQUEST", {
						error_description: "authorization_details must be valid JSON",
						error: "invalid_request",
					});
				}
			}

			// Generate auth_req_id (~190-bit entropy)
			const authReqId = generateRandomString(32, "A-Z", "a-z", "0-9");

			const expiresIn = ctx.body.requested_expiry
				? Math.min(ctx.body.requested_expiry, requestLifetime)
				: requestLifetime;

			await ctx.context.adapter.create({
				model: "cibaRequest",
				data: {
					authReqId,
					clientId,
					userId: user.id,
					scope: ctx.body.scope,
					bindingMessage: ctx.body.binding_message,
					authorizationDetails: ctx.body.authorization_details,
					resource: ctx.body.resource,
					status: "pending",
					deliveryMode: mode,
					clientNotificationToken: ctx.body.client_notification_token,
					clientNotificationEndpoint: notificationEndpoint,
					pollingInterval,
					expiresAt: new Date(Date.now() + expiresIn * 1000),
					createdAt: new Date(),
				},
			});

			const baseURL = ctx.context.baseURL;
			const approvalUrl = `${baseURL}${approvalPage}?auth_req_id=${encodeURIComponent(authReqId)}`;

			options
				.sendNotification(
					{
						userId: user.id,
						authReqId,
						clientName: client.name,
						scope: ctx.body.scope,
						bindingMessage: ctx.body.binding_message,
						authorizationDetails: parsedAuthorizationDetails,
						approvalUrl,
					},
					ctx.request,
				)
				.catch(() => {
					// Notification delivery is best-effort
				});

			// Return response (interval omitted for push mode per spec)
			const response: Record<string, unknown> = {
				auth_req_id: authReqId,
				expires_in: expiresIn,
			};
			if (mode !== "push") {
				response.interval = pollingInterval;
			}

			return ctx.json(response, {
				headers: {
					"Cache-Control": "no-store",
					Pragma: "no-cache",
				},
			});
		},
	);
}

/**
 * Validate id_token_hint JWT and extract the user.
 *
 * Tries asymmetric verification via JWKS (jwt plugin) first,
 * falls back to HS256 symmetric verification using the server secret.
 * Validates that `aud` matches the requesting client_id (CIBA §7.1).
 */
async function resolveUserFromIdTokenHint(
	ctx: {
		context: {
			secret: string;
			baseURL: string;
			adapter: any;
			internalAdapter: any;
			getPlugin: (id: string) => any;
		};
	},
	idTokenHint: string,
	clientId: string,
): Promise<{ id: string } | null> {
	let sub: string | undefined;

	// Try asymmetric verification via JWKS (jwt plugin)
	const jwtPlugin = ctx.context.getPlugin("jwt");
	if (jwtPlugin?.options) {
		try {
			const header = decodeJwtHeader(idTokenHint);
			if (header?.kid) {
				const jwtOpts = jwtPlugin.options;
				let keys: Array<{
					id: string;
					publicKey: string;
					alg?: string;
				}>;

				if (jwtOpts.adapter?.getJwks) {
					keys = await jwtOpts.adapter.getJwks(ctx);
				} else {
					keys = await ctx.context.adapter.findMany({
						model: "jwks",
					});
				}

				const key = keys?.find((k: { id: string }) => k.id === header.kid);
				if (key?.publicKey) {
					const publicKey = JSON.parse(key.publicKey);
					const alg = key.alg ?? jwtOpts.jwks?.keyPairConfig?.alg ?? "EdDSA";
					const cryptoKey = await importJWK(publicKey, alg);
					const { payload } = await jwtVerify(idTokenHint, cryptoKey, {
						issuer: jwtOpts.jwt?.issuer ?? ctx.context.baseURL,
						audience: clientId,
					});
					sub = payload.sub as string | undefined;
				}
			}
		} catch {
			// Asymmetric verification failed — fall through to HS256
		}
	}

	// Fall back to HS256 symmetric verification
	if (!sub) {
		try {
			const { payload } = await jwtVerify(
				idTokenHint,
				new TextEncoder().encode(ctx.context.secret),
				{
					issuer: ctx.context.baseURL,
					audience: clientId,
				},
			);
			sub = payload.sub as string | undefined;
		} catch {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"id_token_hint is invalid, expired, or audience does not match client_id",
				error: "invalid_request",
			});
		}
	}

	if (!sub) {
		throw new APIError("BAD_REQUEST", {
			error_description: "id_token_hint does not contain a valid subject",
			error: "invalid_request",
		});
	}

	return ctx.context.internalAdapter.findUserById(sub);
}

/** Decode the JOSE header from a compact JWT without verifying. */
function decodeJwtHeader(token: string): { alg: string; kid?: string } | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;
		const padded = parts[0]! + "=".repeat((4 - (parts[0]!.length % 4)) % 4);
		const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json);
	} catch {
		return null;
	}
}
