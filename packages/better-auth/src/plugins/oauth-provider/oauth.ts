import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin } from "../../types";
import { parseSetCookieHeader } from "../../cookies";
import { schema } from "./schema";
import type { OAuthOptions } from "./types";
import { authorizeEndpoint } from "./authorize";
import { consentEndpoint } from "./consent";
import { tokenEndpoint } from "./token";
import { userInfoEndpoint } from "./userinfo";
import { mergeSchema } from "../../db";
import { dynamicRegisterEndpoint, registerOAuthClient } from "./register";
import {
	authServerMetadata,
	oidcServerMetadata,
	protectedResourceMetadata,
} from "./metadata";
import { getJwtPlugin } from "./utils";
import { introspectEndpoint } from "./introspect";
import { revokeEndpoint } from "./revoke";
import { BetterAuthError } from "@better-auth/core/error";
import { logger } from "@better-auth/core/env";
import type { ResourceServerMetadata } from "../../oauth-2.1/types";
import { introspectVerifyEndpoint } from "./verify";

/**
 * oAuth 2.1 provider plugin for Better Auth.
 *
 * @see https://better-auth.com/docs/plugins/oauth-provider
 * @param options - The options for the oAuth Provider plugin.
 * @returns A Better Auth plugin.
 */
export const oauthProvider = (options: OAuthOptions) => {
	let clientRegistrationAllowedScopes = options.clientRegistrationAllowedScopes;
	if (options.clientRegistrationDefaultScopes) {
		clientRegistrationAllowedScopes = clientRegistrationAllowedScopes
			? [
					...clientRegistrationAllowedScopes,
					...options.clientRegistrationDefaultScopes,
				]
			: [...options.clientRegistrationDefaultScopes];
	}

	// Validate scopes
	const scopes = new Set(
		(options.scopes ?? ["openid", "profile", "email", "offline_access"]).filter(
			(val) => val.length,
		),
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

	// Validate claims
	const claims = new Set([
		"sub",
		"iss",
		"aud",
		"exp",
		"iat",
		"sid",
		"scope",
		"azp",
		...(scopes.has("email") ? ["email", "email_verified"] : []),
		...(scopes.has("profile")
			? ["name", "picture", "family_name", "given_name"]
			: []),
		...(options?.customClaims?.filter((val) => val.length) ?? []),
	]);
	for (const cl of options.advertisedMetadata?.claims_supported ?? []) {
		if (!claims?.has(cl)) {
			throw new BetterAuthError(
				`advertisedMetadata.claims_supported ${cl} not found in claims`,
			);
		}
	}

	const opts: OAuthOptions & { claims?: string[] } = {
		codeExpiresIn: 600, // 10 min
		accessTokenExpiresIn: 3600, // 1 hour
		m2mAccessTokenExpiresIn: 3600, // 1 hour
		refreshTokenExpiresIn: 2592000, // 30 days
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

	// Both encode and decode refresh tokens must be defined if one is defined
	if (
		(opts.encodeRefreshToken && !opts.decodeRefreshToken) ||
		(!opts.encodeRefreshToken && opts.decodeRefreshToken)
	) {
		throw new BetterAuthError(
			"encodeRefreshToken and decodeRefreshToken should both be defined",
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

	return {
		id: "oauthProvider",
		options: opts,
		init: (ctx) => {
			// Check for jwt plugin registration
			if (!opts.disableJwtPlugin) {
				const jwtPlugin = getJwtPlugin(ctx);
				const jwtPluginOptions = jwtPlugin.options;

				// Issuer and well-known endpoint checks
				const issuer = jwtPluginOptions?.jwt?.issuer ?? ctx.baseURL;
				const issuerPath = new URL(issuer).pathname;
				// oAuth Server Config
				if (
					!opts.silenceWarnings?.oauthAuthServerConfig &&
					!(ctx.options.basePath === "/" && issuerPath === "/")
				) {
					logger.warn(
						`Please ensure '/.well-known/oauth-authorization-server${issuerPath === "/" ? "" : issuerPath}' exists. Upon completion, clear with silenceWarnings.oauthAuthServerConfig.`,
					);
				}
				// OpenId Config
				if (
					!opts.silenceWarnings?.openidConfig &&
					ctx.options.basePath !== issuerPath &&
					opts.scopes?.includes("openid")
				) {
					logger.warn(
						`Please ensure '${issuerPath}${issuerPath.endsWith("/") ? "" : "/"}.well-known/openid-configuration' exists. Upon completion, clear with silenceWarnings.openidConfig.`,
					);
				}
			}
		},
		hooks: {
			after: [
				/**
				 * If a session cookie is being set (ie user has logged in)
				 * complete response with /authorize request.
				 */
				{
					matcher(ctx) {
						return parseSetCookieHeader(
							ctx.context.responseHeaders?.get("set-cookie") || "",
						).has(ctx.context.authCookies.sessionToken.name);
					},
					handler: createAuthMiddleware(async (ctx) => {
						// Obtain original prompt
						const { name: loginPromptCookieName } =
							ctx.context.createAuthCookie("oauth_login_prompt");
						const cookie = await ctx.getSignedCookie(
							loginPromptCookieName,
							ctx.context.secret,
						);

						// Check if session cookie is being set and obtain its session (needed in context)
						const cookieName = ctx.context.authCookies.sessionToken.name;
						const parsedSetCookieHeader = parseSetCookieHeader(
							ctx.context.responseHeaders?.get("set-cookie") || "",
						);
						const sessionToken = parsedSetCookieHeader
							.get(cookieName)
							?.value?.split(".")[0];
						if (!cookie || !sessionToken) return;
						const session =
							await ctx.context.internalAdapter.findSession(sessionToken);
						if (!session) return;
						ctx.context.session = session;

						// Continue with authorization request by using the initial prompt
						// but clearing the login prompt cookie if forced login prompt
						ctx.query = JSON.parse(cookie);
						if (ctx.query?.prompt === "login") {
							ctx.query!.prompt = undefined; // clear login prompt parameter
						}
						ctx.setCookie(loginPromptCookieName, "", {
							maxAge: 0,
						});
						return await authorizeEndpoint(ctx, opts);
					}),
				},
			],
		},
		endpoints: {
			/**
			 * A server_only endpoint that helps provide the
			 * oAuth Server configuration at the well-known endpoint.
			 *
			 * Provided at /.well-known/oauth-authorization-server/[issuer-path]
			 * (root if no issuer-path).
			 */
			getOAuthServerConfig: createAuthEndpoint(
				"/.well-known/oauth-authorization-server/server",
				{
					method: "GET",
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					if (opts.scopes && opts.scopes.includes("openid")) {
						const metadata = oidcServerMetadata(ctx, opts);
						return ctx.json(metadata);
					} else {
						const jwtPluginOptions = opts.disableJwtPlugin
							? undefined
							: getJwtPlugin(ctx.context).options;
						const authMetadata = authServerMetadata(ctx, jwtPluginOptions, {
							scopes_supported:
								opts.advertisedMetadata?.scopes_supported ?? opts.scopes,
						});
						return ctx.json(authMetadata);
					}
				},
			),
			/**
			 * A server_only endpoint that helps provide the
			 * OpenId configuration at the well-known endpoint.
			 *
			 * Provided at [issuer-path]/.well-known/openid-configuration
			 * (root if no issuer-path).
			 */
			getOpenIdConfig: createAuthEndpoint(
				"/.well-known/openid-configuration/server",
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
					return ctx.json(metadata);
				},
			),
			/**
			 * An authorization server does not typically publish
			 * the `/.well-known/oauth-protected-resource` themselves.
			 * Thus, we provide a server-only endpoint help set up
			 * your protected resource metadata.
			 *
			 * If you have your APIs hosted on a different domain,
			 * post the metadata yourself without the need of the full
			 * better-auth library/configuration.
			 *
			 * @see https://datatracker.ietf.org/doc/html/rfc8414#section-2
			 */
			getOAuthProtectedResourceConfig: createAuthEndpoint(
				"/.well-known/oauth-protected-resource/server",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as
								| {
										overrides?: Partial<ResourceServerMetadata>;
								  }
								| undefined,
						},
					},
					body: z
						.object({
							overrides: z.record(z.string(), z.any()),
						})
						.optional(),
				},
				async (ctx) => {
					const overrides = ctx.body?.overrides;
					const metadata = protectedResourceMetadata(ctx, opts, overrides);
					return ctx.json(metadata);
				},
			),
			oauth2Authorize: createAuthEndpoint(
				"/oauth2/authorize",
				{
					method: "GET",
					query: z.object({
						response_type: z.enum(["code"]),
						client_id: z.string(),
						redirect_uri: z.string().optional(),
						scope: z.string().optional(),
						state: z.string().optional(),
						code_challenge: z.string().optional(),
						code_challenge_method: z.enum(["S256"]).optional(),
						nonce: z.string().optional(),
						prompt: z.enum(["consent", "login"]).optional(),
					}),
					metadata: {
						openapi: {
							description: "Authorize an OAuth2 request",
							parameters: [
								{
									name: "response_type",
									in: "query",
									required: true,
									schema: { type: "string" },
									description: "OAuth2 response type (e.g., 'code')",
								},
								{
									name: "client_id",
									in: "query",
									required: true,
									schema: { type: "string" },
									description: "OAuth2 client ID",
								},
								{
									name: "redirect_uri",
									in: "query",
									required: false,
									schema: { type: "string", format: "uri" },
									description: "OAuth2 redirect URI",
								},
								{
									name: "scope",
									in: "query",
									required: false,
									schema: { type: "string" },
									description: "OAuth2 scopes (space-separated)",
								},
								{
									name: "state",
									in: "query",
									required: false,
									schema: { type: "string" },
									description: "OAuth2 state parameter",
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
				async (ctx) => {
					return authorizeEndpoint(ctx, opts);
				},
			),
			oauth2Consent: createAuthEndpoint(
				"/oauth2/consent",
				{
					method: "POST",
					body: z.object({
						accept: z.boolean(),
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
					return consentEndpoint(ctx, opts);
				},
			),
			oauth2Token: createAuthEndpoint(
				"/oauth2/token",
				{
					method: "POST",
					body: z.object({
						grant_type: z.enum([
							"authorization_code",
							"client_credentials",
							"refresh_token",
						]),
						client_id: z.string().optional(),
						client_secret: z.string().optional(),
						code: z.string().optional(),
						code_verifier: z.string().optional(),
						redirect_uri: z.string().optional(),
						refresh_token: z.string().optional(),
						resource: z.string().optional(),
						scope: z.string().optional(),
					}),
					metadata: {
						isAction: false,
						openapi: {
							description: "Obtain an OAuth2.1 access token",
							requestBody: {
								required: true,
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												grant_type: {
													type: "string",
													enum: [
														"authorization_code",
														"client_credentials",
														"refresh_token",
													],
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
													type: "string",
													description:
														"Requested token resource (ie audience) to obtain a JWT formatted access token",
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
														enum: ["Bearer"],
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
					return tokenEndpoint(ctx, opts);
				},
			),
			oauth2Introspect: createAuthEndpoint(
				"/oauth2/introspect",
				{
					method: "POST",
					body: z.object({
						client_id: z.string().optional(),
						client_secret: z.string().optional(),
						token: z.string(),
						token_type_hint: z
							.enum(["access_token", "refresh_token"])
							.optional(),
					}),
					metadata: {
						isAction: false,
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
													enum: ["access_token", "refresh_token"],
													description:
														"Hint about the type of the token submitted for introspection",
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
			oauth2IntrospectVerify: createAuthEndpoint(
				"/oauth2/introspect/verify",
				{
					method: "POST",
					body: z
						.object({
							token: z.string().optional(),
							options: z.object().optional(),
						})
						.optional(),
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					return introspectVerifyEndpoint(
						ctx,
						opts,
						ctx.body?.token,
						ctx.body?.options,
					);
				},
			),
			oauth2Revoke: createAuthEndpoint(
				"/oauth2/revoke",
				{
					method: "POST",
					body: z.object({
						client_id: z.string().optional(),
						client_secret: z.string().optional(),
						token: z.string(),
						token_type_hint: z
							.enum(["access_token", "refresh_token"])
							.optional(),
					}),
					metadata: {
						isAction: false,
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
													enum: ["access_token", "refresh_token"],
													description:
														"Hint about the type of the token submitted for revocation",
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
					method: "GET",
					metadata: {
						isAction: false,
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
									description: "Bearer access token",
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
			registerOAuthClient: createAuthEndpoint(
				"/oauth2/server/register",
				{
					method: "POST",
					body: z.object({
						redirect_uris: z.array(z.string()),
						scope: z.string().optional(),
						client_name: z.string().optional(),
						client_uri: z.string().optional(),
						logo_uri: z.string().optional(),
						contacts: z.array(z.string()).optional(),
						tos_uri: z.string().optional(),
						policy_uri: z.string().optional(),
						software_id: z.string().optional(),
						software_version: z.string().optional(),
						software_statement: z.string().optional(),
						token_endpoint_auth_method: z
							.enum(["none", "client_secret_basic", "client_secret_post"])
							.default("client_secret_basic")
							.optional(),
						grant_types: z
							.array(
								z.enum([
									"authorization_code",
									"client_credentials",
									"refresh_token",
								]),
							)
							.default(["authorization_code"])
							.optional(),
						response_types: z
							.array(z.enum(["code"]))
							.default(["code"])
							.optional(),
						type: z.enum(["web", "native", "user-agent-based"]).optional(),
						// SERVER_ONLY applicable fields
						skip_consent: z.boolean().optional(),
						metadata: z.object().optional(),
					}),
					metadata: {
						SERVER_ONLY: true,
						openapi: {
							description: "Register an OAuth2 application",
							responses: {
								"200": {
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
													token_endpoint_auth_method: {
														type: "string",
														description:
															"Requested authentication method for the token endpoint",
														enum: [
															"none",
															"client_secret_basic",
															"client_secret_post",
														],
													},
													grant_types: {
														type: "array",
														items: {
															type: "string",
															enum: [
																"authorization_code",
																"client_credentials",
																"refresh_token",
															],
														},
														description:
															"Requested authentication method for the token endpoint",
													},
													response_types: {
														type: "array",
														items: {
															type: "string",
															enum: ["code"],
														},
														description:
															"Requested authentication method for the token endpoint",
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
													metadata: {
														type: "object",
														additionalProperties: true,
														nullable: true,
														description:
															"Additional metadata for the application",
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
					return registerOAuthClient(ctx, opts);
				},
			),
			dynamicRegisterOAuthClient: createAuthEndpoint(
				"/oauth2/register",
				{
					method: "POST",
					body: z.object({
						redirect_uris: z.array(z.string()),
						scope: z.string().optional(),
						client_name: z.string().optional(),
						client_uri: z.string().optional(),
						logo_uri: z.string().optional(),
						contacts: z.array(z.string()).optional(),
						tos_uri: z.string().optional(),
						policy_uri: z.string().optional(),
						software_id: z.string().optional(),
						software_version: z.string().optional(),
						software_statement: z.string().optional(),
						token_endpoint_auth_method: z
							.enum(["none", "client_secret_basic", "client_secret_post"])
							.default("client_secret_basic")
							.optional(),
						grant_types: z
							.array(
								z.enum([
									"authorization_code",
									"client_credentials",
									"refresh_token",
								]),
							)
							.default(["authorization_code"])
							.optional(),
						response_types: z
							.array(z.enum(["code"]))
							.default(["code"])
							.optional(),
						type: z.enum(["web", "native", "user-agent-based"]).optional(),
					}),
					metadata: {
						openapi: {
							description: "Register an OAuth2 application",
							responses: {
								"200": {
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
													token_endpoint_auth_method: {
														type: "string",
														description:
															"Requested authentication method for the token endpoint",
														enum: [
															"none",
															"client_secret_basic",
															"client_secret_post",
														],
													},
													grant_types: {
														type: "array",
														items: {
															type: "string",
															enum: [
																"authorization_code",
																"client_credentials",
																"refresh_token",
															],
														},
														description:
															"Requested authentication method for the token endpoint",
													},
													response_types: {
														type: "array",
														items: {
															type: "string",
															enum: ["code"],
														},
														description:
															"Requested authentication method for the token endpoint",
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
					return dynamicRegisterEndpoint(ctx, opts);
				},
			),
		},
		schema: mergeSchema(schema, opts?.schema),
	} satisfies BetterAuthPlugin;
};
