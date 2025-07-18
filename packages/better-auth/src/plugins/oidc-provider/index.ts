import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import type { AuthContext, BetterAuthPlugin, Verification } from "../../types";
import { generateRandomString } from "../../crypto";
import { schema } from "./schema";
import type { OIDCOptions, VerificationValue } from "./types";
import { authorize, formatErrorURL } from "./authorize";
import { parseSetCookieHeader } from "../../cookies";
import { tokenEndpoint, userNormalClaims } from "./token";
import { mergeSchema } from "../../db";
import { registerEndpoint } from "./register";
import { BetterAuthError } from "../../error";
import { oidcMetadata } from "./metadata";
import { getJwtPlugin } from "../jwt";
import { introspectEndpoint } from "./introspect";
import { revokeEndpoint } from "./revoke";

export const getOidcPlugin = (
	ctx: AuthContext,
): Omit<BetterAuthPlugin, "options"> & { options: OIDCOptions } => {
	const plugin = ctx.options.plugins?.find(
		(
			plugin,
		): plugin is Omit<BetterAuthPlugin, "options"> & { options: OIDCOptions } =>
			plugin.id === "oidc" &&
			plugin.options != null &&
			"loginPage" in plugin.options &&
			"consentPage" in plugin.options,
	);

	if (!plugin) {
		throw new BetterAuthError("oidc_config", "oidc-provider plugin not found");
	}

	return plugin;
};

/**
 * OpenID Connect (OIDC) plugin for Better Auth. This plugin implements the
 * authorization code flow and the token exchange flow. It also implements the
 * userinfo endpoint.
 *
 * @param options - The options for the OIDC plugin.
 * @returns A Better Auth plugin.
 */
export const oidcProvider = (options: OIDCOptions): BetterAuthPlugin => {
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
				throw new APIError("BAD_REQUEST", {
					error: "invalid_scope",
					error_description: `clientRegistrationAllowedScope ${sc} not found in scopes`,
				});
			}
		}
	}
	for (const sc of options.advertisedMetadata?.scopes_supported ?? []) {
		if (!scopes?.has(sc)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_scope",
				error_description: `advertisedMetadata.scopes_supported ${sc} not found in scopes`,
			});
		}
	}

	// Validate claims
	const claims = new Set([
		"sub",
		"iss",
		"aud",
		"exp",
		"nbf",
		"iat",
		"jti",
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
			throw new APIError("BAD_REQUEST", {
				error: "invalid_scope",
				error_description: `advertisedMetadata.claims_supported ${cl} not found in claims`,
			});
		}
	}

	const opts: OIDCOptions & { claims?: string[] } = {
		schema: {
			oauthClient: {
				modelName: "oauthClient",
				...options?.schema?.oauthClient,
			},
			oauthConsent: {
				modelName: "oauthConsent",
				...options?.schema?.oauthConsent,
			},
			...options?.schema,
		},
		codeExpiresIn: 600, // 10 min
		accessTokenExpiresIn: 600, // 10 min
		m2mAccessTokenExpiresIn: 3600, // 1 hour
		refreshTokenExpiresIn: 2592000, // 30 days
		allowUnauthenticatedClientRegistration: false,
		allowDynamicClientRegistration: false,
		...options,
		scopes: Array.from(scopes),
		claims: Array.from(claims),
		clientRegistrationAllowedScopes,
	};

	// Both encode and decode refresh tokens must be defined if one is defined
	if (
		(opts.encodeRefreshToken && !opts.decodeRefreshToken) ||
		(!opts.encodeRefreshToken && opts.decodeRefreshToken)
	) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message:
				"encodeRefreshToken and decodeRefreshToken should both be defined",
		});
	}

	return {
		id: "oidc",
		init: (ctx) => {
			// Add the oidc plugin options to ctx
			const plugin = ctx.options.plugins?.find(
				(plugin) => plugin.id === "oidc",
			);
			if (!plugin) {
				throw Error("Plugin should have been register! Should never hit!");
			}
			plugin.options = opts;

			// Check for jwt plugin registration
			const jwtPlugin = getJwtPlugin(ctx);
			if (!jwtPlugin.options?.usesOidcProviderPlugin) {
				throw new BetterAuthError(
					"jwt_config",
					"Must set usesOidcProviderPlugin to true",
				);
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
						const cookie = await ctx.getSignedCookie(
							"oidc_login_prompt",
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
						ctx.setCookie("oidc_login_prompt", "", {
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
						const response = await authorize(ctx, opts);
						return response;
					}),
				},
			],
		},
		endpoints: {
			getOpenIdConfig: createAuthEndpoint(
				"/.well-known/openid-configuration",
				{
					method: "GET",
					metadata: {
						isAction: false,
					},
				},
				async (ctx) => {
					const metadata = oidcMetadata(ctx, opts);
					return ctx.json(metadata);
				},
			),
			oAuth2authorize: createAuthEndpoint(
				"/oauth2/authorize",
				{
					method: "GET",
					query: z.record(z.string(), z.any()),
					metadata: {
						openapi: {
							description: "Authorize an OAuth2 request",
							responses: {
								"200": {
									description: "Authorization response generated successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												additionalProperties: true,
												description:
													"Authorization response, contents depend on the authorize function implementation",
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					return authorize(ctx, opts);
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
					const storedCode = await ctx.getSignedCookie(
						"oidc_consent_prompt",
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
					const codeExpiresInMs = (opts.codeExpiresIn ?? 600) * 1000;
					const expiresAt = new Date(Date.now() + codeExpiresInMs);
					await ctx.context.internalAdapter.updateVerificationValue(
						verification.id,
						{
							value: JSON.stringify({
								...verificationValue,
								requireConsent: false,
							}),
							identifier: code,
							expiresAt,
						},
					);
					await ctx.context.adapter.create({
						model: options.schema?.oauthConsent?.modelName ?? "oauthConsent",
						data: {
							clientId: verificationValue.clientId,
							userId: verificationValue.userId,
							scopes: verificationValue.scopes,
							consentGiven: true,
							createdAt: new Date(),
							updatedAt: new Date(),
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
					body: z.record(z.any()),
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
					if (!ctx.request) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "request not found",
							error: "invalid_request",
						});
					}
					const authorization = ctx.request.headers.get("authorization");
					if (!authorization) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "authorization header not found",
							error: "invalid_request",
						});
					}
					const token = authorization.replace("Bearer ", "");
					const accessToken =
						await ctx.context.internalAdapter.findSession(token);
					if (!accessToken) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid access token",
							error: "invalid_token",
						});
					}
					if (accessToken.session.expiresAt < new Date()) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "The Access Token expired",
							error: "invalid_token",
						});
					}

					if (!accessToken.user) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "user not found",
							error: "invalid_token",
						});
					}
					const scopes = accessToken.session.scopes?.split(" ");
					const user = accessToken.user;
					const baseUserClaims = userNormalClaims(user, scopes ?? []);
					const additionalInfoUserClaims =
						options.getAdditionalUserInfoClaim && scopes?.length
							? await options.getAdditionalUserInfoClaim(user, scopes)
							: {};
					return ctx.json({
						...baseUserClaims,
						...additionalInfoUserClaims,
					});
				},
			),
			registerOAuthClient: createAuthEndpoint(
				"/oauth2/register",
				{
					method: "POST",
					body: z.object({
						client_secret_expires_at: z.number().default(0).optional(),
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
						redirect_uris: z.array(z.string()).optional(),
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
							.array(z.enum(["code", "token"]))
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
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};
export type * from "./types";
