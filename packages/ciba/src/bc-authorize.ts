import {
	getOAuthProviderApi,
	ResourceUriSchema,
} from "@better-auth/oauth-provider";
import {
	createOAuthEndpoint,
	parseClientMetadata,
	resolveResourcePolicy,
	toResourceList,
} from "@better-auth/oauth-provider/internal";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import {
	APPROVAL_PARAMETER,
	BC_AUTHORIZE_PATH,
	CIBA_GRANT_TYPE,
} from "./constants";
import { CIBA_ERROR_CODES, oauthError } from "./error-codes";
import type { CibaRequest } from "./schema";
import type { CibaOptions } from "./types";

// Control and invisible formatting characters, such as bidirectional
// overrides: a binding message must be plain text (CIBA §7.1).
const NON_PLAIN_TEXT = /[\p{Cc}\p{Cf}]/u;

export function createBcAuthorize(
	options: CibaOptions & { expiresIn: number; interval: number },
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
				binding_message: z.string().max(64).optional(),
				requested_expiry: z.coerce.number().int().positive().optional(),
				resource: z
					.union([ResourceUriSchema, z.array(ResourceUriSchema).min(1)])
					.optional(),
			}),
			// Repeated parameters are rejected (RFC 6749 §3.2) except `resource`.
			formParams: { repeatable: ["resource"] },
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
			// init() fails without oauthProvider(), so the plugin is present.
			const oauthOptions = ctx.context.getPlugin("oauth-provider")!.options;
			const provider = getOAuthProviderApi(ctx, oauthOptions, CIBA_GRANT_TYPE);
			// Authenticate first, so an unauthenticated caller cannot probe request
			// validation. The bound grant type requires CIBA in `grant_types`.
			const { client, clientId } = await provider.authenticateClient({
				scopes,
			});
			// CIBA §4 registration metadata. Only server-side client management can
			// set `metadata`, so open registration cannot reach users through CIBA.
			if (
				parseClientMetadata(client.metadata)
					?.backchannel_token_delivery_mode !== "poll"
			) {
				oauthError(
					"unauthorized_client",
					CIBA_ERROR_CODES.UNSUPPORTED_DELIVERY_MODE.message,
				);
			}
			if (!scopes.includes("openid")) {
				oauthError("invalid_scope", CIBA_ERROR_CODES.INVALID_SCOPE.message);
			}
			const bindingMessage = ctx.body.binding_message;
			if (bindingMessage !== undefined && NON_PLAIN_TEXT.test(bindingMessage)) {
				oauthError(
					"invalid_binding_message",
					CIBA_ERROR_CODES.INVALID_BINDING_MESSAGE.message,
				);
			}
			const hints = [
				ctx.body.login_hint,
				ctx.body.id_token_hint,
				ctx.body.login_hint_token,
			].filter(Boolean);
			if (hints.length !== 1) {
				oauthError(
					"invalid_request",
					CIBA_ERROR_CODES.EXACTLY_ONE_HINT.message,
				);
			}
			const loginHint = ctx.body.login_hint;
			if (!loginHint) {
				oauthError(
					"invalid_request",
					CIBA_ERROR_CODES.UNSUPPORTED_HINT.message,
				);
			}

			const resources = toResourceList(ctx.body.resource);
			await resolveResourcePolicy(ctx, oauthOptions, {
				resource: resources,
				clientId,
				requestedScopes: scopes,
			});

			const user = options.resolveUser
				? await options.resolveUser(loginHint, ctx)
				: ((await ctx.context.internalAdapter.findUserByEmail(loginHint))
						?.user ?? null);
			if (!user) {
				oauthError("unknown_user_id", CIBA_ERROR_CODES.UNKNOWN_USER_ID.message);
			}

			// CIBA §7.1: requested_expiry may shorten, never extend, the lifetime.
			const expiresIn = Math.min(
				ctx.body.requested_expiry ?? options.expiresIn,
				options.expiresIn,
			);
			const expiresAt = new Date(Date.now() + expiresIn * 1000);
			// CIBA §7.3: at least 128 bits of entropy (32 × log2(62) ≈ 190 bits).
			const authReqId = generateRandomString(32, "a-z", "A-Z", "0-9");
			const request = await ctx.context.adapter.create<CibaRequest>({
				model: "cibaRequest",
				data: {
					authReqId: await provider.hashToken(authReqId, "auth_req_id"),
					clientId,
					userId: user.id,
					scope: scopes.join(" "),
					bindingMessage,
					resources: resources ?? null,
					status: "pending",
					expiresAt,
					createdAt: new Date(),
				},
			});

			const url = new URL(`${ctx.context.baseURL}/oauth2/authorize`);
			url.searchParams.set(APPROVAL_PARAMETER, request.id);
			// The async wrapper turns a synchronous throw into a logged failure too,
			// so the client always receives its auth_req_id.
			await ctx.context.runInBackgroundOrAwait(
				(async () =>
					options.sendNotification(
						{
							user,
							clientId,
							clientName: client.name ?? undefined,
							scopes,
							bindingMessage,
							url: url.toString(),
							expiresAt,
						},
						ctx,
					))(),
			);

			return ctx.json({
				auth_req_id: authReqId,
				expires_in: expiresIn,
				interval: options.interval,
			});
		},
	);
}
