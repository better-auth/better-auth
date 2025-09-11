import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin, Verification } from "../../types";
import { generateRandomString } from "../../crypto";
import { schema } from "./schema";
import type { OAuthOptions, VerificationValue } from "./types";
import { authorizeEndpoint, formatErrorURL } from "./authorize";
import { parseSetCookieHeader } from "../../cookies";
import { tokenEndpoint } from "./token";
import { userinfoEndpoint } from "./userinfo";
import { mergeSchema } from "../../db";
import { registerEndpoint } from "./register";
import {
	authServerMetadata,
	oidcServerMetadata,
	protectedResourceMetadata,
} from "./metadata";
import { getJwtPlugin } from "./utils";
import { introspectEndpoint } from "./introspect";
import { revokeEndpoint } from "./revoke";
import { BetterAuthError } from "../../error";
import { logger } from "../../utils";
import type { ResourceServerMetadata } from "../../oauth-2.1/types";
export { authServerMetadata, oidcServerMetadata } from "./metadata";
export {
	oAuthProviderAuthServerMetadata,
	oAuthProviderOpenIdConfigMetadata,
	oAuthProviderProtectedResourceMetadata,
} from "./metadata";
export { mcpHandler, checkMcp, handleMcpErrors } from "./mcp";

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
		if (!clientRegistrationAllowedScopes) {
			clientRegistrationAllowedScopes = options.clientRegistrationDefaultScopes;
		} else {
			clientRegistrationAllowedScopes.push(
				...options.clientRegistrationDefaultScopes,
			);
		}
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
		disableJWTPlugin: false,
		storeClientSecret: options.disableJWTPlugin ? "encrypted" : "hashed",
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
		opts.disableJWTPlugin &&
		(opts.storeClientSecret === "hashed" ||
			(typeof opts.storeClientSecret === "object" &&
				"hash" in opts.storeClientSecret))
	) {
		throw new BetterAuthError(
			"unable to store hashed secrets because id tokens will be signed with secret",
		);
	}

	if (
		!opts.disableJWTPlugin &&
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
			if (!opts.disableJWTPlugin) {
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
				{
					matcher() {
						return true;
					},
					/**
					 * If user logged in already (after a redirect to /login request),
					 * prompt a consent screen or return with session if consented
					 */
					handler: createAuthMiddleware(async (ctx) => {
						const { name: loginPromptCookieName } =
							ctx.context.createAuthCookie("oauth_login_prompt");
						const cookie = await ctx.getSignedCookie(
							loginPromptCookieName,
							ctx.context.secret,
						);
						const cookieName = ctx.context.authCookies.sessionToken.name;
						const parsedSetCookieHeader = parseSetCookieHeader(
							ctx.context.responseHeaders?.get("set-cookie") || "",
						);
						const hasSessionToken = parsedSetCookieHeader.has(cookieName);
						if (!cookie || !hasSessionToken) {
							return;
						}
						ctx.setCookie(loginPromptCookieName, "", {
							maxAge: 0,
						});
						const sessionCookie = parsedSetCookieHeader.get(cookieName)?.value;
						const sessionToken = sessionCookie?.split(".")[0];
						if (!sessionToken) {
							return;
						}
						const session =
							await ctx.context.internalAdapter.findSession(sessionToken);
						if (!session) {
							return;
						}
						// Return the initial query into the context but prompt for consent
						ctx.query = JSON.parse(cookie);
						ctx.query!.prompt = "consent";
						ctx.context.session = session;
						const response = await authorizeEndpoint(ctx, opts);
						return response;
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
						const jwtPluginOptions = opts.disableJWTPlugin
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
			oAuth2authorize: createAuthEndpoint(
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
			oAuthConsent: createAuthEndpoint(
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
													redirectURI: {
														type: "string",
														format: "uri",
														description:
															"The URI to redirect to, either with an authorization code or an error",
													},
												},
												required: ["redirectURI"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const { name: cookieName } = ctx.context.createAuthCookie(
						"oauth_consent_prompt",
					);
					const storedCode = await ctx.getSignedCookie(
						cookieName,
						ctx.context.secret,
					);
					if (!storedCode) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "No consent prompt found",
							error: "invalid_request",
						});
					}

					const verification = await ctx.context.internalAdapter
						.findVerificationValue(storedCode)
						.then((val) => {
							if (!val) return null;
							return {
								...val,
								value: val?.value ? JSON.parse(val?.value) : undefined,
							} as Omit<Verification, "value"> & { value?: VerificationValue };
						});
					const verificationValue = verification?.value;

					// Check verification
					if (!verification) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "Invalid code",
							error: "invalid_request",
						});
					}
					if (verification.expiresAt < new Date()) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "Code expired",
							error: "invalid_request",
						});
					}

					// Check verification value
					if (!verificationValue) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "missing verification value content",
							error: "invalid_verification",
						});
					}
					if (!verificationValue.requireConsent) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "Consent given or not required",
							error: "invalid_request",
						});
					}
					if (!verificationValue.redirectUri) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "Missing redirect uri",
							error: "invalid_request",
						});
					}

					// Consent not accepted
					if (!ctx.body.accept) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verification.id,
						);
						return ctx.json({
							redirectURI: formatErrorURL(
								verificationValue.redirectUri,
								"access_denied",
								"User denied access",
								verificationValue.state,
							),
						});
					}

					// Consent accepted
					const code = generateRandomString(32, "a-z", "A-Z", "0-9");
					const iat = Math.floor(Date.now() / 1000);
					const now = new Date(iat * 1000);
					const exp = iat + (opts.codeExpiresIn ?? 600);

					await ctx.context.internalAdapter.updateVerificationValue(
						verification.id,
						{
							value: JSON.stringify({
								...verificationValue,
								requireConsent: false,
							}),
							identifier: code,
							expiresAt: new Date(exp * 1000),
						},
					);
					await ctx.context.adapter.create({
						model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
						data: {
							clientId: verificationValue.clientId,
							userId: verificationValue.userId,
							scopes: verificationValue.scopes,
							consentGiven: true,
							createdAt: now,
							updatedAt: now,
						},
					});
					const redirectURI = new URL(
						verificationValue.redirectUri ?? opts.loginPage,
					);
					redirectURI.searchParams.set("code", code);
					if (verificationValue.state) {
						redirectURI.searchParams.set("state", verificationValue.state);
					}
					// Redirect back to application
					return ctx.json({
						redirectURI: redirectURI.toString(),
					});
				},
			),
			oAuth2token: createAuthEndpoint(
				"/oauth2/token",
				{
					method: "POST",
					body: z.any(),
					metadata: {
						isAction: false,
					},
				},
				async (ctx) => {
					return tokenEndpoint(ctx, opts);
				},
			),
			oAuth2introspect: createAuthEndpoint(
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
					},
				},
				async (ctx) => {
					return introspectEndpoint(ctx, opts);
				},
			),
			oAuth2revoke: createAuthEndpoint(
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
					},
				},
				async (ctx) => {
					return revokeEndpoint(ctx, opts);
				},
			),
			oAuth2userInfo: createAuthEndpoint(
				"/oauth2/userinfo",
				{
					method: "GET",
					metadata: {
						isAction: false,
						openapi: {
							description: "Get OAuth2 user information",
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
							},
						},
					},
				},
				async (ctx) => {
					return userinfoEndpoint(ctx, opts);
				},
			),
			registerOAuthClient: createAuthEndpoint(
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
														type: "string",
														description:
															"Requested authentication method for the token endpoint",
														nullable: true,
														enum: [
															"authorization_code",
															"client_credentials",
															"refresh_token",
														],
													},
													response_types: {
														type: "string",
														description:
															"Requested authentication method for the token endpoint",
														nullable: true,
														enum: ["code", "token"],
													},
													public: {
														type: "boolean",
														description:
															"Whether the client is public as determined by the type",
														enum: [false],
													},
													type: {
														type: "string",
														description: "Type of the client",
														enum: ["web", "native", "user-agent-based"],
													},
													disabled: {
														type: "boolean",
														description: "Whether the client is disabled",
														enum: [false],
													},
													// metadata: {
													// 	type: "object",
													// 	additionalProperties: true,
													// 	nullable: true,
													// 	description:
													// 		"Additional metadata for the application",
													// },
												},
												required: ["clientId"],
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
		},
		schema: mergeSchema(schema, opts?.schema),
	} satisfies BetterAuthPlugin;
};
export type * from "./types";
