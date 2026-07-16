import type { GenericEndpointContext } from "@better-auth/core";
import { defineRequestState } from "@better-auth/core/context";
import { logger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { DispatchContext } from "better-auth/api";
import {
	APIError,
	addOAuthServerContext,
	createAuthEndpoint,
	createAuthMiddleware,
	dispatchAuthEndpoint,
	getOAuthState,
	sessionMiddleware,
} from "better-auth/api";
import { parseSetCookieHeader } from "better-auth/cookies";
import { mergeSchema } from "better-auth/db";
import type { BetterAuthPlugin } from "better-auth/types";
import * as z from "zod";
import type { AuthorizeEndpointSettings } from "./authorize";
import { authorizeEndpoint, authorizeRedirectOnError } from "./authorize";
import { claimsRequestParameterSchema } from "./claims-request";
import { consentEndpoint } from "./consent";
import { continueEndpoint } from "./continue";
import { validateOAuthProviderExtensions } from "./extensions";
import { introspectEndpoint } from "./introspect";
import {
	deliverBackchannelLogoutTokens,
	revokeAndPlanBackchannelLogout,
	rpInitiatedLogoutEndpoint,
} from "./logout";
import {
	metadataResponse,
	oauthAuthorizationServerMetadata,
	oidcServerMetadata,
} from "./metadata";
import { createOAuthEndpoint } from "./oauth-endpoint";
import { oauthProviderSettingsCards } from "./oauth-provider-ui";
import * as oauthClientEndpoints from "./oauthClient";
import * as oauthConsentEndpoints from "./oauthConsent";
import * as oauthResourceEndpoints from "./oauthResource";
import { registerEndpoint } from "./register";
import {
	extractRepeatedResourceFromForm,
	logEnforcePerClientResourcesResolution,
	seedResources,
} from "./resources";
import { revokeEndpoint } from "./revoke";
import { schema } from "./schema";
import { STANDARD_CLAIM_NAMES, STANDARD_CLAIMS } from "./standard-claims";
import { tokenEndpoint } from "./token";
import type { OAuthOptions, Scope } from "./types";
import {
	clientRegistrationRequestSchema,
	ResourceUriSchema,
	SafeUrlSchema,
} from "./types/zod";
import { userInfoEndpoint } from "./userinfo";
import {
	getJwtPlugin,
	getSignedQueryIssuedAt,
	isSessionFreshForSignedQuery,
	postLoginClearedParam,
	removeMaxAgeFromQuery,
	removePromptFromQuery,
	searchParamsToQuery,
	signedQueryIssuedAtParam,
	verifyOAuthQueryParams,
} from "./utils";
import { PACKAGE_VERSION } from "./version";

/**
 * Default scopes advertised and accepted when a configuration sets none. Shared
 * with the MCP preset so the resource metadata it serves matches what the
 * authorization-server metadata advertises.
 */
export const DEFAULT_OAUTH_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
] as const;

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"oauth-provider": {
			creator: typeof oauthProvider;
		};
	}
}

export const oAuthState = defineRequestState<{
	query?: string;
	signedQueryIssuedAt?: Date;
	postLoginClearedForSession?: string;
} | null>(() => null);
export const getOAuthProviderState = oAuthState.get;
const signedQueryIssuedAtMsKey = "signedQueryIssuedAtMs";

function getServerContextSignedQueryIssuedAt(value: unknown) {
	const issuedAtMs =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: undefined;
	if (!issuedAtMs || !Number.isFinite(issuedAtMs) || issuedAtMs <= 0) {
		return undefined;
	}
	return new Date(issuedAtMs);
}

/**
 * oAuth 2.1 provider plugin for Better Auth.
 *
 * @see https://better-auth.com/docs/plugins/oauth-provider
 * @param options - The options for the oAuth Provider plugin.
 * @returns A Better Auth plugin.
 */
export const oauthProvider = <O extends OAuthOptions<Scope[]>>(options: O) => {
	let clientRegistrationAllowedScopes = options.clientRegistrationAllowedScopes;
	if (options.clientRegistrationDefaultScopes) {
		const _allowedScopes = clientRegistrationAllowedScopes
			? new Set([
					...clientRegistrationAllowedScopes,
					...options.clientRegistrationDefaultScopes,
				])
			: new Set([...options.clientRegistrationDefaultScopes]);
		clientRegistrationAllowedScopes = Array.from(_allowedScopes);
	}

	// Validate scopes
	const scopes = new Set(
		(options.scopes ?? DEFAULT_OAUTH_SCOPES).filter((val) => val.length),
	);
	if (clientRegistrationAllowedScopes) {
		for (const sc of clientRegistrationAllowedScopes) {
			if (!scopes.has(sc)) {
				throw new BetterAuthError(
					`clientRegistrationAllowedScope ${sc} not found in scopes`,
				);
			}
		}
	}
	for (const sc of options.advertisedMetadata?.scopes_supported ?? []) {
		if (!scopes?.has(sc)) {
			throw new BetterAuthError(
				`advertisedMetadata.scopes_supported ${sc} not found in scopes`,
			);
		}
	}

	// Discovery `claims_supported`: protocol claims that are always present, plus
	// the standard identity claims whose backing scope is configured. The
	// identity set is derived from the one claim registry so the advertisement
	// cannot drift from what UserInfo actually resolves.
	const claims = new Set([
		"sub",
		"iss",
		"aud",
		"exp",
		"iat",
		"sid",
		"scope",
		"azp",
		...STANDARD_CLAIM_NAMES.filter((name) =>
			scopes.has(STANDARD_CLAIMS[name].scope),
		),
	]);

	const opts: O & { claims?: string[] } = {
		codeExpiresIn: 600, // 10 min
		accessTokenExpiresIn: 3600, // 1 hour
		m2mAccessTokenExpiresIn: 3600, // 1 hour
		refreshTokenExpiresIn: 2592000, // 30 days
		refreshTokenReuseInterval: 0,
		allowUnauthenticatedClientRegistration: false,
		allowDynamicClientRegistration: false,
		disableJwtPlugin: false,
		storeClientSecret: options.disableJwtPlugin ? "encrypted" : "hashed",
		storeTokens: "hashed",
		grantTypes: ["authorization_code", "client_credentials", "refresh_token"],
		...options,
		scopes: Array.from(scopes),
		claims: Array.from(claims),
		clientRegistrationAllowedScopes,
	};
	validateOAuthProviderExtensions(opts.extensions);

	// Validate pairwiseSecret minimum length
	if (opts.pairwiseSecret && opts.pairwiseSecret.length < 32) {
		throw new BetterAuthError(
			"pairwiseSecret must be at least 32 characters long for adequate HMAC-SHA256 security",
		);
	}

	// TODO: device_code grant also allows for refresh tokens
	if (
		opts.grantTypes &&
		opts.grantTypes.includes("refresh_token") &&
		!opts.grantTypes.includes("authorization_code")
	) {
		throw new BetterAuthError(
			"refresh_token grant requires authorization_code grant",
		);
	}

	if (
		opts.disableJwtPlugin &&
		(opts.storeClientSecret === "hashed" ||
			(typeof opts.storeClientSecret === "object" &&
				"hash" in opts.storeClientSecret))
	) {
		throw new BetterAuthError(
			"unable to store hashed secrets because id tokens will be signed with secret",
		);
	}

	if (
		!opts.disableJwtPlugin &&
		(opts.storeClientSecret === "encrypted" ||
			(typeof opts.storeClientSecret === "object" &&
				("encrypt" in opts.storeClientSecret ||
					"decrypt" in opts.storeClientSecret)))
	) {
		throw new BetterAuthError(
			"encryption method not recommended, please use 'hashed' or the 'hash' function",
		);
	}

	const handleIssuerMetadataRequest: NonNullable<
		BetterAuthPlugin["onRequest"]
	> = async (request, ctx) => {
		const requestPathname = new URL(request.url).pathname;
		const requestPath = ctx.options.advanced?.skipTrailingSlashes
			? requestPathname.replace(/\/+$/, "") || "/"
			: requestPathname;
		const issuer = opts.disableJwtPlugin
			? ctx.baseURL
			: (getJwtPlugin(ctx)?.options?.jwt?.issuer ?? ctx.baseURL);
		let issuerPath = "/";
		try {
			issuerPath = new URL(issuer).pathname.replace(/\/$/, "") || "";
		} catch {
			issuerPath = new URL(ctx.baseURL).pathname.replace(/\/$/, "") || "";
		}

		const endpointCtx = { context: ctx } as GenericEndpointContext;
		// RFC 8414 uses path insertion; some clients derive discovery from the
		// issuer URL directly, so keep both public aliases equivalent.
		const authServerMetadataPaths = new Set([
			`/.well-known/oauth-authorization-server${issuerPath}`,
			`${issuerPath}/.well-known/oauth-authorization-server`,
		]);
		const openIdConfigPath = `${issuerPath}/.well-known/openid-configuration`;
		const isAuthServerMetadataRequest =
			authServerMetadataPaths.has(requestPath);
		const isOpenIdConfigRequest =
			opts.scopes?.includes("openid") && requestPath === openIdConfigPath;
		const createMetadataResponse = (metadata: unknown) => {
			const response = metadataResponse(metadata);
			if (request.method === "HEAD") {
				return new Response(null, {
					status: response.status,
					headers: response.headers,
				});
			}
			return response;
		};
		if (isAuthServerMetadataRequest || isOpenIdConfigRequest) {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return {
					response: new Response(null, {
						status: 405,
						headers: {
							Allow: "GET, HEAD",
						},
					}),
				};
			}
		}

		if (isAuthServerMetadataRequest) {
			if (opts.scopes?.includes("openid")) {
				return {
					response: createMetadataResponse(
						oidcServerMetadata(endpointCtx, opts),
					),
				};
			}
			return {
				response: createMetadataResponse(
					oauthAuthorizationServerMetadata(endpointCtx, opts),
				),
			};
		}

		if (isOpenIdConfigRequest) {
			return {
				response: createMetadataResponse(oidcServerMetadata(endpointCtx, opts)),
			};
		}
	};
	type OAuth2AuthorizeContext = GenericEndpointContext & {
		authorizeSettings?: AuthorizeEndpointSettings | undefined;
	};
	type OAuth2AuthorizeResult = Awaited<ReturnType<typeof authorizeEndpoint>>;

	const oauth2AuthorizeEndpoint = createOAuthEndpoint(
		"/oauth2/authorize",
		{
			method: ["GET", "POST"],
			body: z.object({}).passthrough(),
			redirectOnError: authorizeRedirectOnError(opts),
			metadata: {
				allowedMediaTypes: ["application/x-www-form-urlencoded"],
				openapi: {
					description:
						"Authorize an OAuth 2.1 request from query parameters or an application/x-www-form-urlencoded POST body",
					parameters: [
						{
							name: "response_type",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "OAuth 2.1 response type (e.g., 'code')",
						},
						{
							name: "client_id",
							in: "query",
							required: true,
							schema: { type: "string" },
							description: "OAuth 2.1 client ID",
						},
						{
							name: "redirect_uri",
							in: "query",
							required: false,
							schema: { type: "string", format: "uri" },
							description: "OAuth 2.1 redirect URI",
						},
						{
							name: "scope",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "OAuth 2.1 scopes (space-separated)",
						},
						{
							name: "state",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "OAuth 2.1 state parameter",
						},
						{
							name: "request_uri",
							in: "query",
							required: false,
							schema: { type: "string" },
							description:
								"Pushed Authorization Request URI referencing stored parameters",
						},
						{
							name: "code_challenge",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "PKCE code challenge",
						},
						{
							name: "code_challenge_method",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "PKCE code challenge method",
						},
						{
							name: "nonce",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "OpenID Connect nonce",
						},
						{
							name: "max_age",
							in: "query",
							required: false,
							schema: { type: "integer", minimum: 0 },
							description:
								"Maximum authentication age in seconds; forces re-authentication when exceeded",
						},
						{
							name: "resource",
							in: "query",
							required: false,
							schema: { type: "array", items: { type: "string" } },
							description:
								"Requested protected resource(s) for the access token. May be supplied multiple times as repeated 'resource' query parameters (RFC 8707) or as an array of strings.",
						},
						{
							name: "prompt",
							in: "query",
							required: false,
							schema: { type: "string" },
							description: "OAuth2 prompt parameter",
						},
					],
					responses: {
						"302": {
							description: "Redirect to client with code or error",
							headers: {
								Location: {
									description: "Redirect URI with code or error",
									schema: { type: "string", format: "uri" },
								},
							},
						},
						"400": {
							description: "Invalid request",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											error: { type: "string" },
											error_description: { type: "string" },
											state: { type: "string" },
										},
										required: ["error"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx): Promise<OAuth2AuthorizeResult> => {
			const settings = (ctx as OAuth2AuthorizeContext).authorizeSettings ?? {
				isAuthorize: true,
			};
			return authorizeEndpoint(ctx, opts, settings);
		},
	);

	const runOAuth2Authorize = (
		ctx: GenericEndpointContext,
		settings?: AuthorizeEndpointSettings,
	): Promise<OAuth2AuthorizeResult> =>
		dispatchAuthEndpoint(oauth2AuthorizeEndpoint, {
			...ctx,
			asResponse: false,
			returnHeaders: false,
			returnStatus: false,
			authorizeSettings: settings ?? {},
		} as DispatchContext &
			OAuth2AuthorizeContext) as Promise<OAuth2AuthorizeResult>;

	return {
		id: "oauth-provider",
		version: PACKAGE_VERSION,
		options: opts as NoInfer<O>,
		onRequest: handleIssuerMetadataRequest,
		init: async (ctx) => {
			// OAuth provider performs adapter-level session lookups by id, so it
			// currently requires DB-backed sessions whenever secondary storage is enabled.
			if (
				ctx.options.secondaryStorage &&
				ctx.options.session?.storeSessionInDatabase !== true
			) {
				throw new BetterAuthError(
					"OAuth Provider requires `session.storeSessionInDatabase: true` when using secondaryStorage",
				);
			}

			// Seed `oauthResource` rows from plugin config. Idempotent and
			// race-safe (UNIQUE constraint on identifier). No-op when `resources`
			// is empty. Tolerates
			// "table not yet created" errors and defers to lazy-seed.
			await seedResources(ctx, opts);

			// Record which default applied to `enforcePerClientResources` so
			// admins can see it in startup logs. Pure resolution lives in
			// `resolveEnforcePerClientResources` so validation flow stays cheap.
			logEnforcePerClientResourcesResolution(opts);

			// Well-known warnings are best-effort and only make sense with the
			// JWT plugin. A dynamic baseURL resolves per-request, so there is
			// nothing to emit at init time for that deployment shape either.
			if (!opts.disableJwtPlugin) {
				const jwtPlugin = getJwtPlugin(ctx);
				const jwtPluginOptions = jwtPlugin?.options;
				const issuer = jwtPluginOptions?.jwt?.issuer ?? ctx.baseURL;
				const isDynamicBaseURLInit =
					jwtPluginOptions?.jwt?.issuer == null &&
					typeof ctx.options.baseURL === "object" &&
					ctx.options.baseURL !== null &&
					"allowedHosts" in ctx.options.baseURL;
				let issuerPath: string | undefined;
				try {
					issuerPath = new URL(issuer).pathname;
				} catch (error) {
					if (!isDynamicBaseURLInit || issuer !== "") throw error;
				}
				if (
					issuerPath !== undefined &&
					!opts.silenceWarnings?.oauthAuthServerConfig &&
					!(ctx.options.basePath === "/" && issuerPath === "/")
				) {
					logger.warn(
						`Please ensure '/.well-known/oauth-authorization-server${issuerPath === "/" ? "" : issuerPath}' exists. Upon completion, clear with silenceWarnings.oauthAuthServerConfig.`,
					);
				}
				if (
					issuerPath !== undefined &&
					!opts.silenceWarnings?.openidConfig &&
					ctx.options.basePath !== issuerPath &&
					opts.scopes?.includes("openid")
				) {
					logger.warn(
						`Please ensure '${issuerPath}${issuerPath.endsWith("/") ? "" : "/"}.well-known/openid-configuration' exists. Upon completion, clear with silenceWarnings.openidConfig.`,
					);
				}
			}

			// The hook must register for every configuration path (including
			// dynamic baseURL). Revocation runs inline because it mutates DB
			// state we rely on. The HTTP fan-out goes through
			// `runInBackgroundOrAwait`: with a background handler configured
			// (Vercel `waitUntil`, CF `ctx.waitUntil`) it runs after the
			// response; without one it is awaited inline so delivery is not lost
			// on request teardown. Awaiting here keeps both paths reliable.
			return {
				options: {
					databaseHooks: {
						session: {
							delete: {
								async before(session, hookCtx) {
									if (!hookCtx) return;
									const plan = await revokeAndPlanBackchannelLogout(
										hookCtx,
										opts,
										{
											sessionId: session.id,
											userId: session.userId,
										},
									);
									if (!plan) return;
									// TODO: re-evaluate this await. It makes delivery reliable on
									// every runtime, but without an `advanced.backgroundTasks.handler`
									// a hung RP can add up to the per-RP timeout to sign-out latency.
									// Alternative to weigh: keep delivery non-blocking and instead
									// hard-require a background handler when back-channel logout is on.
									await hookCtx.context.runInBackgroundOrAwait(
										deliverBackchannelLogoutTokens(hookCtx, plan),
									);
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			before: [
				{
					// Add oauth_query to request state
					matcher(ctx) {
						return ctx.body?.oauth_query;
					},
					handler: createAuthMiddleware(async (ctx) => {
						// Verify query signature
						const query = ctx.body.oauth_query;
						const isValid = await verifyOAuthQueryParams(
							query,
							ctx.context.secret,
						);
						if (!isValid) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_signature",
							});
						}
						const signedQueryIssuedAt = getSignedQueryIssuedAt(query);
						const queryParams = new URLSearchParams(query);
						const postLoginClearedForSession =
							queryParams.get(postLoginClearedParam) ?? undefined;
						queryParams.delete("sig");
						queryParams.delete("exp");
						queryParams.delete(signedQueryIssuedAtParam);
						queryParams.delete(postLoginClearedParam);
						await oAuthState.set({
							query: queryParams.toString(),
							signedQueryIssuedAt: signedQueryIssuedAt ?? undefined,
							postLoginClearedForSession,
						});

						// On the social sign-in path the authorize query has to survive the
						// provider redirect to be resumed after login. Carry it in the
						// server-only OAuth state so a client cannot inject its own `query`
						// through the request body.
						if (ctx.path === "/sign-in/social") {
							await addOAuthServerContext({
								query: queryParams.toString(),
								...(signedQueryIssuedAt
									? {
											[signedQueryIssuedAtMsKey]: signedQueryIssuedAt.getTime(),
										}
									: {}),
							});
						}
					}),
				},
			],
			after: [
				{
					// Should only capture when session cookie is set (ie after login)
					matcher(ctx) {
						return parseSetCookieHeader(
							ctx.context.responseHeaders?.get("set-cookie") || "",
						).has(ctx.context.authCookies.sessionToken.name);
					},
					handler: createAuthMiddleware(async (ctx) => {
						// Check if session cookie is being set and obtain its session (needed in context)
						const sessionToken = parseSetCookieHeader(
							ctx.context.responseHeaders?.get("set-cookie") || "",
						)
							.get(ctx.context.authCookies.sessionToken.name)
							?.value.split(".")[0];
						if (!sessionToken) return;
						// Continue with authorization request by using the initial prompt
						// but clearing the login prompt cookie if forced login prompt
						const oauthRequest = await oAuthState.get();
						const oauthState = await getOAuthState();
						const serverContext = oauthState?.serverContext;
						const _query =
							oauthRequest?.query ??
							(serverContext?.query as string | undefined);
						if (!_query) return;
						const query = new URLSearchParams(_query);

						const session =
							await ctx.context.internalAdapter.findSession(sessionToken);
						if (!session) return;
						ctx.context.session = session;

						const secFetchMode = ctx.request?.headers
							?.get("sec-fetch-mode")
							?.toLowerCase();
						const acceptHeader =
							ctx.request?.headers?.get("accept")?.toLowerCase() ?? "";
						const isNavigationRequest =
							secFetchMode === "navigate" ||
							(!secFetchMode &&
								(acceptHeader.includes("text/html") ||
									acceptHeader.includes("application/xhtml+xml")));
						if (!isNavigationRequest) {
							ctx.headers?.set("accept", "application/json");
						}
						const signedQueryIssuedAt =
							oauthRequest?.signedQueryIssuedAt ??
							getServerContextSignedQueryIssuedAt(
								serverContext?.[signedQueryIssuedAtMsKey],
							);
						let authorizationQuery = removePromptFromQuery(query, "login");
						if (
							isSessionFreshForSignedQuery(
								session.session.createdAt,
								signedQueryIssuedAt,
							)
						) {
							authorizationQuery = removeMaxAgeFromQuery(authorizationQuery);
						}
						ctx.query = searchParamsToQuery(authorizationQuery);
						return await runOAuth2Authorize(ctx);
					}),
				},
			],
		},
		endpoints: {
			/**
			 * A server-only endpoint that helps provide the
			 * oAuth Server configuration at the well-known endpoint.
			 *
			 * Provided at /.well-known/oauth-authorization-server/[issuer-path]
			 * (root if no issuer-path).
			 */
			getOAuthServerConfig: createAuthEndpoint(
				"/.well-known/oauth-authorization-server",
				{
					method: "GET",
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					if (opts.scopes && opts.scopes.includes("openid")) {
						const metadata = oidcServerMetadata(ctx, opts);
						return metadata;
					} else {
						return oauthAuthorizationServerMetadata(ctx, opts);
					}
				},
			),
			/**
			 * A server-only endpoint that helps provide the
			 * OpenId configuration at the well-known endpoint.
			 *
			 * Provided at [issuer-path]/.well-known/openid-configuration
			 * (root if no issuer-path).
			 */
			getOpenIdConfig: createAuthEndpoint(
				"/.well-known/openid-configuration",
				{
					method: "GET",
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					if (opts.scopes && !opts.scopes.includes("openid")) {
						throw new APIError("NOT_FOUND");
					}
					const metadata = oidcServerMetadata(ctx, opts);
					return metadata;
				},
			),
			oauth2Authorize: oauth2AuthorizeEndpoint,
			oauth2Consent: createAuthEndpoint(
				"/oauth2/consent",
				{
					method: "POST",
					body: z.object({
						accept: z.boolean().meta({
							description: "Accept or deny user consent for a set of scopes",
						}),
						scope: z.string().optional().meta({
							description:
								"List of accept of accepted space-separated scopes. If none is provided, then all originally requested scopes are accepted.",
						}),
						claims: claimsRequestParameterSchema.optional().meta({
							description:
								"Accepted OIDC claims request object. If none is provided, then all originally requested claims are accepted.",
						}),
						oauth_query: z.string().optional().meta({
							description: "The redirected page's query parameters",
						}),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Handle OAuth2 consent",
							responses: {
								"200": {
									description: "Consent processed successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													redirect_uri: {
														type: "string",
														format: "uri",
														description:
															"The URI to redirect to, either with an authorization code or an error",
													},
												},
												required: ["redirect_uri"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return consentEndpoint(ctx, opts, runOAuth2Authorize);
				},
			),
			oauth2Continue: createAuthEndpoint(
				"/oauth2/continue",
				{
					method: "POST",
					body: z.object({
						selected: z.boolean().optional().meta({
							description:
								"Confirms an account has been selected and authorization can proceed.",
						}),
						created: z.boolean().optional().meta({
							description: "Confirms an account was registered",
						}),
						postLogin: z.boolean().optional().meta({
							description: "Confirms organization and/or team selection.",
						}),
						oauth_query: z.string().optional().meta({
							description: "The redirected page's query parameters",
						}),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Continues OAuth2 authorization flow",
							responses: {
								"200": {
									description: "Consent processed successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													redirect_uri: {
														type: "string",
														format: "uri",
														description:
															"The URI to redirect to, either with an authorization code or an error",
													},
												},
												required: ["redirect_uri"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return continueEndpoint(ctx, runOAuth2Authorize);
				},
			),
			oauth2Token: createOAuthEndpoint(
				"/oauth2/token",
				{
					method: "POST",
					// RFC 8707 §2 allows the client to repeat the `resource`
					// parameter. better-call's form-body parser collapses
					// repeated keys (last-write-wins) so we re-parse the raw
					// body in the handler to recover the full list. That
					// requires the underlying request body to be readable a
					// second time, which only works when better-call clones
					// the request before its own parse.
					cloneRequest: true,
					body: z
						.object({
							grant_type: z.string().trim().min(1),
							client_id: z.string().optional(),
							client_secret: z.string().optional(),
							client_assertion: z.string().optional(),
							client_assertion_type: z.string().optional(),
							code: z.string().optional(),
							code_verifier: z.string().optional(),
							redirect_uri: SafeUrlSchema.optional(),
							refresh_token: z.string().optional(),
							resource: z
								.union([ResourceUriSchema, z.array(ResourceUriSchema).min(1)])
								.optional(),
							scope: z.string().optional(),
						})
						.passthrough(),
					errorCodesByField: {
						grant_type: {
							missing: "invalid_request",
							invalid: "unsupported_grant_type",
						},
						resource: { invalid: "invalid_target" },
					},
					metadata: {
						noStore: true,
						allowedMediaTypes: ["application/x-www-form-urlencoded"],
						openapi: {
							description: "Obtain an OAuth2.1 access token",
							parameters: [
								{
									name: "DPoP",
									in: "header",
									required: false,
									schema: { type: "string" },
									description:
										"RFC 9449 DPoP proof JWT for issuing DPoP-bound tokens",
								},
							],
							requestBody: {
								required: true,
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												grant_type: {
													type: "string",
													description: "OAuth2 grant type",
												},
												client_id: {
													type: "string",
													description: "OAuth2 client ID",
												},
												client_secret: {
													type: "string",
													description: "OAuth2 client secret",
												},
												code: {
													type: "string",
													description:
														"Authorization code (for authorization_code grant)",
												},
												code_verifier: {
													type: "string",
													description:
														"PKCE code verifier (for authorization_code grant)",
												},
												redirect_uri: {
													type: "string",
													format: "uri",
													description:
														"Redirect URI (for authorization_code grant)",
												},
												refresh_token: {
													type: "string",
													description:
														"Refresh token (for refresh_token grant)",
												},
												resource: {
													oneOf: [
														{
															type: "string",
															description: "Single resource (URL)",
														},
														{
															type: "array",
															items: { type: "string" },
															description: "Multiple resources (URLs)",
														},
													],
													description:
														"Requested protected resource(s) for the access token",
												},
												scope: {
													type: "string",
													description:
														"Requested scopes (for client_credentials grant)",
												},
											},
											required: ["grant_type"],
										},
									},
								},
							},
							responses: {
								"200": {
									description: "Access token response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													access_token: {
														type: "string",
														description:
															"The access token issued by the authorization server",
													},
													token_type: {
														type: "string",
														description: "The type of the token issued",
														enum: ["Bearer", "DPoP"],
													},
													expires_in: {
														type: "number",
														description:
															"Lifetime in seconds of the access token",
													},
													refresh_token: {
														type: "string",
														description: "Refresh token, if issued",
													},
													scope: {
														type: "string",
														description: "Scopes granted by the access token",
													},
													id_token: {
														type: "string",
														description: "ID Token (if OpenID Connect)",
													},
												},
												required: ["access_token", "token_type", "expires_in"],
											},
										},
									},
								},
								"400": {
									description: "Invalid request or error response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: { type: "string" },
													error_description: { type: "string" },
													error_uri: { type: "string" },
												},
												required: ["error"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					// RFC 8707 §2 conformance — recover repeated `resource`
					// values from the raw body before delegating to the token
					// pipeline. Only patches `ctx.body.resource` when the raw
					// form actually carried multiple entries; the
					// single-value path (and the in-process auth.api.* call
					// path where there is no Request body to re-read) is left
					// untouched. See `extractRepeatedResourceFromForm` in
					// resources.ts for rationale.
					if (ctx.request) {
						const repeated = await extractRepeatedResourceFromForm(ctx.request);
						if (repeated && repeated.length > 1) {
							ctx.body.resource = repeated;
						}
					}
					return tokenEndpoint(ctx, opts);
				},
			),
			oauth2Introspect: createOAuthEndpoint(
				"/oauth2/introspect",
				{
					method: "POST",
					body: z.object({
						client_id: z.string().optional(),
						client_secret: z.string().optional(),
						client_assertion: z.string().optional(),
						client_assertion_type: z.string().optional(),
						token: z.string(),
						// RFC 7662 §2.1: hint, server MAY ignore. Unknown values are
						// coerced to undefined in introspectEndpoint so detection falls
						// back to trying both token types.
						token_type_hint: z.string().optional(),
					}),
					metadata: {
						noStore: true,
						allowedMediaTypes: ["application/x-www-form-urlencoded"],
						openapi: {
							description: "Introspect an OAuth2 access or refresh token",
							requestBody: {
								required: true,
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												client_id: {
													type: "string",
													description: "OAuth2 client ID",
												},
												client_secret: {
													type: "string",
													description: "OAuth2 client secret",
												},
												token: {
													type: "string",
													description:
														"The token to introspect (access or refresh token)",
												},
												token_type_hint: {
													type: "string",
													description:
														"Hint about the token type. Recognized values: `access_token`, `refresh_token`.",
												},
											},
											required: ["token"],
										},
									},
								},
							},
							responses: {
								"200": {
									description: "Token introspection response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													active: {
														type: "boolean",
														description: "Whether the token is active",
													},
													scope: {
														type: "string",
														description: "Scopes associated with the token",
													},
													client_id: {
														type: "string",
														description: "Client ID associated with the token",
													},
													username: {
														type: "string",
														description: "Username associated with the token",
													},
													token_type: {
														type: "string",
														description: "Type of the token",
													},
													exp: {
														type: "number",
														description:
															"Expiration time of the token (seconds since epoch)",
													},
													iat: {
														type: "number",
														description: "Issued at time (seconds since epoch)",
													},
													nbf: {
														type: "number",
														description:
															"Not before time (seconds since epoch)",
													},
													sub: {
														type: "string",
														description: "Subject of the token",
													},
													aud: {
														type: "string",
														description: "Audience of the token",
													},
													iss: {
														type: "string",
														description: "Issuer of the token",
													},
													jti: {
														type: "string",
														description: "JWT ID",
													},
												},
												required: ["active"],
											},
										},
									},
								},
								"400": {
									description: "Invalid request or error response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: { type: "string" },
													error_description: { type: "string" },
													error_uri: { type: "string" },
												},
												required: ["error"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return introspectEndpoint(ctx, opts);
				},
			),
			oauth2Revoke: createOAuthEndpoint(
				"/oauth2/revoke",
				{
					method: "POST",
					body: z.object({
						client_id: z.string().optional(),
						client_secret: z.string().optional(),
						client_assertion: z.string().optional(),
						client_assertion_type: z.string().optional(),
						token: z.string(),
						// RFC 7009 §2.2.1: hint, server MAY ignore. Unknown values are
						// coerced to undefined in revokeEndpoint; `unsupported_token_type`
						// in RFC 7009 applies to the token itself, not the hint value.
						token_type_hint: z.string().optional(),
					}),
					metadata: {
						allowedMediaTypes: ["application/x-www-form-urlencoded"],
						openapi: {
							description: "Revoke an OAuth2 access or refresh token",
							requestBody: {
								required: true,
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												client_id: {
													type: "string",
													description: "OAuth2 client ID",
												},
												client_secret: {
													type: "string",
													description: "OAuth2 client secret",
												},
												token: {
													type: "string",
													description:
														"The token to revoke (access or refresh token)",
												},
												token_type_hint: {
													type: "string",
													description:
														"Hint about the token type. Recognized values: `access_token`, `refresh_token`.",
												},
											},
											required: ["token"],
										},
									},
								},
							},
							responses: {
								"200": {
									description:
										"Token revoked successfully. The response body is empty.",
									content: {
										"application/json": {
											schema: {
												type: "object",
												description: "Empty object on success",
											},
										},
									},
								},
								"400": {
									description: "Invalid request or error response",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: { type: "string" },
													error_description: { type: "string" },
													error_uri: { type: "string" },
												},
												required: ["error"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return revokeEndpoint(ctx, opts);
				},
			),
			oauth2UserInfo: createAuthEndpoint(
				"/oauth2/userinfo",
				{
					method: ["GET", "POST"],
					body: z
						.object({
							access_token: z.string().optional(),
						})
						.passthrough()
						.optional(),
					metadata: {
						noStore: true,
						allowedMediaTypes: ["application/x-www-form-urlencoded"],
						openapi: {
							description:
								"Get OpenID Connect user information (UserInfo endpoint)",
							security: [
								{ bearerAuth: [] },
								{ OAuth2: ["openid", "profile", "email"] },
							],
							parameters: [
								{
									name: "Authorization",
									in: "header",
									required: false,
									schema: { type: "string" },
									description: "Bearer or DPoP access token",
								},
								{
									name: "DPoP",
									in: "header",
									required: false,
									schema: { type: "string" },
									description:
										"RFC 9449 DPoP proof JWT when using a DPoP-bound access token",
								},
							],
							responses: {
								"200": {
									description: "User information retrieved successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													sub: {
														type: "string",
														description: "Subject identifier (user ID)",
													},
													email: {
														type: "string",
														format: "email",
														nullable: true,
														description:
															"User's email address, included if 'email' scope is granted",
													},
													name: {
														type: "string",
														nullable: true,
														description:
															"User's full name, included if 'profile' scope is granted",
													},
													picture: {
														type: "string",
														format: "uri",
														nullable: true,
														description:
															"User's profile picture URL, included if 'profile' scope is granted",
													},
													given_name: {
														type: "string",
														nullable: true,
														description:
															"User's given name, included if 'profile' scope is granted",
													},
													family_name: {
														type: "string",
														nullable: true,
														description:
															"User's family name, included if 'profile' scope is granted",
													},
													email_verified: {
														type: "boolean",
														nullable: true,
														description:
															"Whether the email is verified, included if 'email' scope is granted",
													},
												},
												required: ["sub"],
											},
										},
									},
								},
								"401": {
									description: "Unauthorized - invalid or missing access token",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: { type: "string" },
													error_description: { type: "string" },
												},
												required: ["error"],
											},
										},
									},
								},
								"403": {
									description: "Forbidden - insufficient scope",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													error: { type: "string" },
													error_description: { type: "string" },
												},
												required: ["error"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return userInfoEndpoint(ctx, opts);
				},
			),
			oauth2EndSession: createOAuthEndpoint(
				"/oauth2/end-session",
				{
					method: "GET",
					query: z.object({
						id_token_hint: z.string(),
						client_id: z.string().optional(),
						post_logout_redirect_uri: SafeUrlSchema.optional(),
						state: z.string().optional(),
					}),
					metadata: {
						openapi: {
							description:
								"RP-Initiated Logout endpoint. Allows clients to notify the OP that the End-User has logged out.",
							responses: {
								"200": {
									description:
										"Logout successful. May include redirect_uri if post_logout_redirect_uri was provided.",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													redirect_uri: {
														type: "string",
														format: "uri",
														description:
															"URI to redirect to after logout (if post_logout_redirect_uri was provided)",
													},
													message: {
														type: "string",
														description: "Success message",
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
					return rpInitiatedLogoutEndpoint(ctx, opts);
				},
			),
			registerOAuthClient: createOAuthEndpoint(
				"/oauth2/register",
				{
					method: "POST",
					body: clientRegistrationRequestSchema,
					errorCodesByField: {
						redirect_uris: "invalid_redirect_uri",
						post_logout_redirect_uris: "invalid_redirect_uri",
						software_statement: "invalid_software_statement",
						// RFC 8707 §2: a malformed resource indicator is invalid_target,
						// matching the existence check in registerEndpoint.
						resources: "invalid_target",
					},
					defaultError: "invalid_client_metadata",
					metadata: {
						noStore: true,
						openapi: {
							description: "Register an OAuth2 application",
							responses: {
								"201": {
									description: "OAuth2 application registered successfully",
									content: {
										"application/json": {
											schema: {
												/** @returns {OauthClient} */
												type: "object",
												properties: {
													client_id: {
														type: "string",
														description: "Unique identifier for the client",
													},
													client_secret: {
														type: "string",
														description: "Secret key for the client",
													},
													client_secret_expires_at: {
														type: "number",
														description:
															"Time the client secret will expire. If 0, the client secret will never expire.",
													},
													scope: {
														type: "string",
														description:
															"Space-separated scopes allowed by the client",
													},
													user_id: {
														type: "string",
														description:
															"ID of the user who registered the client, null if registered anonymously",
													},
													client_id_issued_at: {
														type: "number",
														description: "Creation timestamp of this client",
													},
													client_name: {
														type: "string",
														description: "Name of the OAuth2 application",
													},
													client_uri: {
														type: "string",
														description: "Name of the OAuth2 application",
													},
													logo_uri: {
														type: "string",
														description: "Icon URL for the application",
													},
													contacts: {
														type: "array",
														items: {
															type: "string",
														},
														description:
															"List representing ways to contact people responsible for this client, typically email addresses",
													},
													tos_uri: {
														type: "string",
														description: "Client's terms of service uri",
													},
													policy_uri: {
														type: "string",
														description: "Client's policy uri",
													},
													software_id: {
														type: "string",
														description:
															"Unique identifier assigned by the developer to help in the dynamic registration process",
													},
													software_version: {
														type: "string",
														description:
															"Version identifier for the software_id",
													},
													software_statement: {
														type: "string",
														description:
															"JWT containing metadata values about the client software as claims",
													},
													redirect_uris: {
														type: "array",
														items: {
															type: "string",
															format: "uri",
														},
														description: "List of allowed redirect uris",
													},
													post_logout_redirect_uris: {
														type: "array",
														items: {
															type: "string",
															format: "uri",
														},
														description: "List of allowed logout redirect uris",
													},
													backchannel_logout_uri: {
														type: "string",
														format: "uri",
														description:
															"RP URL to receive signed Logout Tokens when the end-user's OP session terminates",
													},
													backchannel_logout_session_required: {
														type: "boolean",
														description:
															"Whether the RP requires a `sid` claim in every Logout Token",
													},
													token_endpoint_auth_method: {
														type: "string",
														description:
															"Requested authentication method for the token endpoint",
													},
													grant_types: {
														type: "array",
														items: {
															type: "string",
														},
														description:
															"Grant types the client may use at the token endpoint",
													},
													response_types: {
														type: "array",
														items: {
															type: "string",
															enum: ["code"],
														},
														description:
															"Response types the client may use at the authorization endpoint",
													},
													public: {
														type: "boolean",
														description:
															"Whether the client is public as determined by the type",
													},
													type: {
														type: "string",
														description: "Type of the client",
														enum: ["web", "native", "user-agent-based"],
													},
													disabled: {
														type: "boolean",
														description: "Whether the client is disabled",
													},
												},
												required: ["client_id"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return registerEndpoint(ctx, opts);
				},
			),
			adminCreateOAuthClient: oauthClientEndpoints.adminCreateOAuthClient(opts),
			createOAuthClient: oauthClientEndpoints.createOAuthClient(opts),
			getOAuthClient: oauthClientEndpoints.getOAuthClient(opts),
			getOAuthClientPublic: oauthClientEndpoints.getOAuthClientPublic(opts),
			getOAuthClientPublicPrelogin:
				oauthClientEndpoints.getOAuthClientPublicPrelogin(opts),
			getOAuthClients: oauthClientEndpoints.getOAuthClients(opts),
			adminUpdateOAuthClient: oauthClientEndpoints.adminUpdateOAuthClient(opts),
			updateOAuthClient: oauthClientEndpoints.updateOAuthClient(opts),
			rotateClientSecret: oauthClientEndpoints.rotateClientSecret(opts),
			deleteOAuthClient: oauthClientEndpoints.deleteOAuthClient(opts),
			getOAuthConsent: oauthConsentEndpoints.getOAuthConsent(opts),
			getOAuthConsents: oauthConsentEndpoints.getOAuthConsents(opts),
			updateOAuthConsent: oauthConsentEndpoints.updateOAuthConsent(opts),
			deleteOAuthConsent: oauthConsentEndpoints.deleteOAuthConsent(opts),
			adminCreateOAuthResource:
				oauthResourceEndpoints.adminCreateOAuthResource(opts),
			adminListOAuthResources:
				oauthResourceEndpoints.adminListOAuthResources(opts),
			adminGetOAuthResource: oauthResourceEndpoints.adminGetOAuthResource(opts),
			adminUpdateOAuthResource:
				oauthResourceEndpoints.adminUpdateOAuthResource(opts),
			adminDeleteOAuthResource:
				oauthResourceEndpoints.adminDeleteOAuthResource(opts),
			adminLinkClientResource:
				oauthResourceEndpoints.adminLinkClientResource(opts),
			adminUnlinkClientResource:
				oauthResourceEndpoints.adminUnlinkClientResource(opts),
		},
		schema: mergeSchema(schema, opts?.schema),
		rateLimit: [
			// Token endpoint - critical for preventing credential stuffing
			...(opts.rateLimit?.token !== false
				? [
						{
							pathMatcher: (path: string) => path === "/oauth2/token",
							window: opts.rateLimit?.token?.window ?? 60,
							max: opts.rateLimit?.token?.max ?? 20,
						},
					]
				: []),
			// Authorize endpoint - user-facing, prevent auth floods
			...(opts.rateLimit?.authorize !== false
				? [
						{
							pathMatcher: (path: string) => path === "/oauth2/authorize",
							window: opts.rateLimit?.authorize?.window ?? 60,
							max: opts.rateLimit?.authorize?.max ?? 30,
						},
					]
				: []),
			// Introspection - high traffic API endpoint
			...(opts.rateLimit?.introspect !== false
				? [
						{
							pathMatcher: (path: string) => path === "/oauth2/introspect",
							window: opts.rateLimit?.introspect?.window ?? 60,
							max: opts.rateLimit?.introspect?.max ?? 100,
						},
					]
				: []),
			// Revocation - moderate traffic
			...(opts.rateLimit?.revoke !== false
				? [
						{
							pathMatcher: (path: string) => path === "/oauth2/revoke",
							window: opts.rateLimit?.revoke?.window ?? 60,
							max: opts.rateLimit?.revoke?.max ?? 30,
						},
					]
				: []),
			// Dynamic registration - prevent spam
			...(opts.rateLimit?.register !== false
				? [
						{
							pathMatcher: (path: string) => path === "/oauth2/register",
							window: opts.rateLimit?.register?.window ?? 60,
							max: opts.rateLimit?.register?.max ?? 5,
						},
					]
				: []),
			// UserInfo - API endpoint
			...(opts.rateLimit?.userinfo !== false
				? [
						{
							pathMatcher: (path: string) => path === "/oauth2/userinfo",
							window: opts.rateLimit?.userinfo?.window ?? 60,
							max: opts.rateLimit?.userinfo?.max ?? 60,
						},
					]
				: []),
		],
		ui: {
			capabilities: {
				"oauth-provider": {
					id: "oauth-provider",
					enabled: true,
					routes: {
						getConsents: {
							type: "auth-route",
							path: "/oauth2/get-consents",
							method: "GET",
						},
						deleteConsent: {
							type: "auth-route",
							path: "/oauth2/delete-consent",
							method: "POST",
						},
					},
				},
			},
			settingsCards: oauthProviderSettingsCards,
		},
	} satisfies BetterAuthPlugin;
};
