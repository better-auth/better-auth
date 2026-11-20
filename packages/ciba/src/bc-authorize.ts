import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthActorClaim,
	OAuthAuthorizationDetail,
} from "@better-auth/oauth-provider";
import {
	getOAuthProviderApi,
	ResourceUriSchema,
} from "@better-auth/oauth-provider";
import {
	createOAuthEndpoint,
	getAuthEndpointUrl,
	parseClientMetadata,
	parseScopes,
	resolveResourcePolicy,
	toResourceList,
} from "@better-auth/oauth-provider/internal";
import { APIError, isAPIError } from "better-auth/api";
import { generateRandomString, symmetricEncrypt } from "better-auth/crypto";
import * as z from "zod";
import { parseActor } from "./actor";
import { toPendingRequest } from "./approval";
import {
	getRegisteredDetailsTypes,
	parseAuthorizationDetails,
	storeAuthorizationDetails,
	validateAuthorizationDetails,
} from "./authorization-details";
import {
	APPROVAL_PARAMETER,
	BC_AUTHORIZE_PATH,
	CIBA_GRANT_TYPE,
} from "./constants";
import type { CibaDelivery } from "./delivery";
import { resolveCibaDelivery } from "./delivery";
import { CIBA_ERROR_CODES, oauthError } from "./error-codes";
import type { CibaRequest } from "./schema";
import type { ResolvedCibaOptions } from "./types";

// Control and invisible formatting characters, such as bidirectional
// overrides: a binding message must be plain text (CIBA §7.1).
const NON_PLAIN_TEXT = /[\p{Cc}\p{Cf}]/u;

/**
 * CIBA §13 answers `invalid_client` with 401 for every cause: bad credentials,
 * an unknown client, no client identifier, no client authentication, or an
 * unsupported method.
 * RFC 9110 §15.5.2 requires a challenge on a 401, so a challenge the client
 * authentication already set is kept and `Basic` is sent otherwise.
 */
async function authenticateBackchannelClient<T>(
	authenticate: () => T | Promise<T>,
) {
	try {
		return await authenticate();
	} catch (error) {
		const body = isAPIError(error)
			? (error.body as
					| { error?: unknown; error_description?: unknown }
					| undefined)
			: undefined;
		// A request that names no client has no client authentication to check,
		// which RFC 6749 §5.2 also reports as `invalid_client`.
		const missingClientId =
			body?.error === "invalid_request" &&
			body.error_description === "Missing required client_id";
		if (
			!isAPIError(error) ||
			(body?.error !== "invalid_client" && !missingClientId)
		) {
			throw error;
		}
		const headers = new Headers(error.headers);
		if (!headers.has("WWW-Authenticate")) {
			headers.set("WWW-Authenticate", "Basic");
		}
		headers.set("Access-Control-Expose-Headers", "WWW-Authenticate");
		throw new APIError(
			"UNAUTHORIZED",
			missingClientId ? { ...body, error: "invalid_client" } : error.body,
			headers,
		);
	}
}

/** The link the user approves from, or none when `approvalPage` is `false`. */
function approvalURL(
	ctx: GenericEndpointContext,
	approvalPage: string | false | undefined,
	requestId: string,
): string | undefined {
	if (approvalPage === false) return undefined;
	const url = new URL(
		approvalPage === undefined
			? getAuthEndpointUrl(ctx, "/oauth2/authorize")
			: approvalPage,
		ctx.context.baseURL,
	);
	// A page URL that already names the parameter must not keep a stale id.
	url.searchParams.set(APPROVAL_PARAMETER, requestId);
	return url.toString();
}

export function createBcAuthorize(options: ResolvedCibaOptions) {
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
				// CIBA §7.1: voluntary, space-separated, in order of preference.
				acr_values: z.string().max(1024).optional(),
				// RFC 9396 §2: a JSON array, form-encoded as a string. Copied into the
				// signed consent URL, so its URL-encoded form stays under URL limits.
				authorization_details: z
					.string()
					.refine((value) => encodeURIComponent(value).length <= 4096)
					.optional(),
				// CIBA §7.1: an RFC 6750 bearer credential of at most 1024 characters.
				client_notification_token: z
					.string()
					.max(1024)
					.regex(/^[\w.~+/-]+=*$/)
					.optional(),
				requested_expiry: z.coerce.number().int().positive().optional(),
				resource: z
					.union([ResourceUriSchema, z.array(ResourceUriSchema).min(1)])
					.optional(),
			}),
			// Repeated parameters are rejected (RFC 6749 §3.2) except `resource`.
			formParams: { repeatable: ["resource"] },
			errorCodesByField: {
				binding_message: "invalid_binding_message",
				authorization_details: "invalid_authorization_details",
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
										required: ["auth_req_id", "expires_in", "interval"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const scopes = parseScopes(ctx.body.scope);
			// init() fails without oauthProvider(), so the plugin is present.
			const oauthOptions = ctx.context.getPlugin("oauth-provider")!.options;
			const provider = getOAuthProviderApi(ctx, oauthOptions, CIBA_GRANT_TYPE);
			// Authenticate first, so an unauthenticated caller cannot probe request
			// validation. The bound grant type requires CIBA in `grant_types`.
			const { client, clientId } = await authenticateBackchannelClient(() =>
				provider.authenticateClient({ scopes }),
			);
			// CIBA §4: registration also validates this; recheck it in case the
			// stored metadata or the configured modes changed since.
			const metadata = parseClientMetadata(client.metadata);
			let delivery: CibaDelivery;
			try {
				delivery = resolveCibaDelivery(metadata, options.deliveryModes);
			} catch {
				return oauthError(
					"unauthorized_client",
					CIBA_ERROR_CODES.UNSUPPORTED_DELIVERY_MODE.message,
				);
			}
			let ping: { endpoint: string; token: string } | undefined;
			if (delivery.mode === "ping") {
				const token = ctx.body.client_notification_token;
				if (!token) {
					oauthError(
						"invalid_request",
						CIBA_ERROR_CODES.NOTIFICATION_TOKEN_REQUIRED.message,
					);
				}
				ping = { endpoint: delivery.notificationEndpoint, token };
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
			const policy = await resolveResourcePolicy(ctx, oauthOptions, {
				resource: resources,
				clientId,
				requestedScopes: scopes,
			});
			// A resource's scope allowlist can drop `openid`, which would issue no ID
			// token; refuse before the user is asked to approve.
			if (!policy.effectiveScopes.includes("openid")) {
				oauthError(
					"invalid_scope",
					CIBA_ERROR_CODES.RESOURCE_DROPS_OPENID.message,
				);
			}

			let authorizationDetails: OAuthAuthorizationDetail[] | undefined;
			if (ctx.body.authorization_details !== undefined) {
				authorizationDetails = await validateAuthorizationDetails(
					parseAuthorizationDetails(ctx.body.authorization_details),
					{
						options,
						client,
						ctx,
						// RFC 9396 §10: a client that registered types is held to them.
						allowedTypes: getRegisteredDetailsTypes(metadata),
					},
				);
			}
			const acrValues = ctx.body.acr_values?.match(/\S+/g) ?? undefined;

			const user = options.resolveUser
				? await options.resolveUser({ loginHint, client }, ctx)
				: ((await ctx.context.internalAdapter.findUserByEmail(loginHint))
						?.user ?? null);
			if (!user) {
				oauthError("unknown_user_id", CIBA_ERROR_CODES.UNKNOWN_USER_ID.message);
			}
			let actor: OAuthActorClaim | undefined;
			if (options.resolveActor) {
				const resolved = await options.resolveActor(
					{ client, user, scopes },
					ctx,
				);
				actor = resolved === undefined ? undefined : parseActor(resolved);
			}

			// CIBA §7.1: requested_expiry may shorten, never extend, the lifetime.
			const expiresIn = Math.min(
				ctx.body.requested_expiry ?? options.expiresIn,
				options.expiresIn,
			);
			const expiresAt = new Date(Date.now() + expiresIn * 1000);
			// Clients that stop polling leave their requests behind; clear expired
			// ones here, as the verification table does on lookup.
			await ctx.context.adapter.deleteMany({
				model: "cibaRequest",
				where: [{ field: "expiresAt", operator: "lt", value: new Date() }],
			});
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
					acrValues: acrValues ?? null,
					authorizationDetails: storeAuthorizationDetails(authorizationDetails),
					resources: resources ?? null,
					actor: actor ?? null,
					status: "pending",
					...(ping
						? {
								clientNotificationEndpoint: ping.endpoint,
								encryptedClientNotificationToken: await symmetricEncrypt({
									key: ctx.context.secretConfig,
									data: ping.token,
								}),
								encryptedAuthReqId: await symmetricEncrypt({
									key: ctx.context.secretConfig,
									data: authReqId,
								}),
							}
						: {}),
					expiresAt,
					createdAt: new Date(),
				},
			});

			// The async wrapper turns a synchronous throw, including one from
			// building the link, into a logged failure too, so the client always
			// receives its auth_req_id.
			await ctx.context.runInBackgroundOrAwait(
				(async () =>
					options.sendNotification(
						// The same view getCibaRequest returns, plus the user and link.
						{
							...toPendingRequest(request, client),
							user,
							url: approvalURL(ctx, options.approvalPage, request.id),
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
