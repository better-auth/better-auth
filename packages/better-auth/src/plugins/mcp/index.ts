import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { isProduction, logger } from "@better-auth/core/env";
import { getWebcryptoSubtle } from "@better-auth/utils";
import { base64 } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { SignJWT } from "jose";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../api";
import { parseSetCookieHeader } from "../../cookies";
import { generateRandomString } from "../../crypto";
import { HIDE_METADATA } from "../../utils";
import { getBaseURL } from "../../utils/url";
import type {
	Client,
	CodeVerificationValue,
	OAuthAccessToken,
	OIDCMetadata,
	OIDCOptions,
} from "../oidc-provider";
import { oidcProvider } from "../oidc-provider";
import { schema } from "../oidc-provider/schema";
import { parsePrompt } from "../oidc-provider/utils/prompt";
import { authorizeMCPOAuth } from "./authorize";

interface MCPOptions {
	loginPage: string;
	resource?: string | undefined;
	oidcConfig?: OIDCOptions | undefined;
}

export const getMCPProviderMetadata = (
	ctx: GenericEndpointContext,
	options?: OIDCOptions | undefined,
): OIDCMetadata => {
	const issuer = ctx.context.options.baseURL as string;
	const baseURL = ctx.context.baseURL;
	if (!issuer || !baseURL) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "invalid_issuer",
			error_description:
				"issuer or baseURL is not set. If you're the app developer, please make sure to set the `baseURL` in your auth config.",
		});
	}
	return {
		issuer,
		authorization_endpoint: `${baseURL}/mcp/authorize`,
		token_endpoint: `${baseURL}/mcp/token`,
		userinfo_endpoint: `${baseURL}/mcp/userinfo`,
		jwks_uri: `${baseURL}/mcp/jwks`,
		registration_endpoint: `${baseURL}/mcp/register`,
		scopes_supported: ["openid", "profile", "email", "offline_access"],
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		acr_values_supported: [
			"urn:mace:incommon:iap:silver",
			"urn:mace:incommon:iap:bronze",
		],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: ["RS256", "none"],
		token_endpoint_auth_methods_supported: [
			"client_secret_basic",
			"client_secret_post",
			"none",
		],
		code_challenge_methods_supported: ["S256"],
		claims_supported: [
			"sub",
			"iss",
			"aud",
			"exp",
			"nbf",
			"iat",
			"jti",
			"email",
			"email_verified",
			"name",
		],
		...options?.metadata,
	};
};

export const getMCPProtectedResourceMetadata = (
	ctx: GenericEndpointContext,
	options?: MCPOptions | undefined,
) => {
	const baseURL = ctx.context.baseURL;
	const origin = new URL(baseURL).origin;

	return {
		resource: options?.resource ?? origin,
		authorization_servers: [origin],
		jwks_uri: options?.oidcConfig?.metadata?.jwks_uri ?? `${baseURL}/mcp/jwks`,
		scopes_supported: options?.oidcConfig?.metadata?.scopes_supported ?? [
			"openid",
			"profile",
			"email",
			"offline_access",
		],
		bearer_methods_supported: ["header"],
		resource_signing_alg_values_supported: ["RS256", "none"],
	};
};

const registerMcpClientBodySchema = z.object({
	redirect_uris: z.array(z.string()),
	token_endpoint_auth_method: z
		.enum(["none", "client_secret_basic", "client_secret_post"])
		.default("client_secret_basic")
		.optional(),
	grant_types: z
		.array(
			z.enum([
				"authorization_code",
				"implicit",
				"password",
				"client_credentials",
				"refresh_token",
				"urn:ietf:params:oauth:grant-type:jwt-bearer",
				"urn:ietf:params:oauth:grant-type:saml2-bearer",
			]),
		)
		.default(["authorization_code"])
		.optional(),
	response_types: z
		.array(z.enum(["code", "token"]))
		.default(["code"])
		.optional(),
	client_name: z.string().optional(),
	client_uri: z.string().optional(),
	logo_uri: z.string().optional(),
	scope: z.string().optional(),
	contacts: z.array(z.string()).optional(),
	tos_uri: z.string().optional(),
	policy_uri: z.string().optional(),
	jwks_uri: z.string().optional(),
	jwks: z.record(z.string(), z.any()).optional(),
	metadata: z.record(z.any(), z.any()).optional(),
	software_id: z.string().optional(),
	software_version: z.string().optional(),
	software_statement: z.string().optional(),
});

const mcpOAuthTokenBodySchema = z.record(z.any(), z.any());

export const mcp = (options: MCPOptions) => {
	const opts = {
		codeExpiresIn: 600,
		defaultScope: "openid",
		accessTokenExpiresIn: 3600,
		refreshTokenExpiresIn: 604800,
		allowPlainCodeChallengeMethod: true,
		...options.oidcConfig,
		loginPage: options.loginPage,
		scopes: [
			"openid",
			"profile",
			"email",
			"offline_access",
			...(options.oidcConfig?.scopes || []),
		],
	};
	const modelName = {
		oauthClient: "oauthApplication",
		oauthAccessToken: "oauthAccessToken",
		oauthConsent: "oauthConsent",
	};
	const provider = oidcProvider(opts);
	return {
		id: "mcp",
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
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
						const sessionToken = sessionCookie?.split(".")[0]!;
						if (!sessionToken) {
							return;
						}
						const session =
							(await ctx.context.internalAdapter.findSession(sessionToken)) ||
							ctx.context.newSession;
						if (!session) {
							return;
						}
						// Remove "login" from prompt since user just logged in
						const promptSet = parsePrompt(String(ctx.query?.prompt));
						if (promptSet.has("login")) {
							const newPromptSet = new Set(promptSet);
							newPromptSet.delete("login");
							ctx.query = {
								...ctx.query,
								prompt: Array.from(newPromptSet).join(" "),
							};
						}

						ctx.context.session = session;
						const response = await authorizeMCPOAuth(ctx, opts);
						return response;
					}),
				},
			],
		},
		endpoints: {
			oAuthConsent: provider.endpoints.oAuthConsent,
			getMcpOAuthConfig: createAuthEndpoint(
				"/.well-known/oauth-authorization-server",
				{
					method: "GET",
					metadata: {
						...HIDE_METADATA,
					},
				},
				async (c) => {
					try {
						const metadata = getMCPProviderMetadata(c, options);
						return c.json(metadata);
					} catch (e) {
						console.log(e);
						return c.json(null);
					}
				},
			),
			getMCPProtectedResource: createAuthEndpoint(
				"/.well-known/oauth-protected-resource",
				{
					method: "GET",
					metadata: {
						...HIDE_METADATA,
					},
				},
				async (c) => {
					const metadata = getMCPProtectedResourceMetadata(c, options);
					return c.json(metadata);
				},
			),
			mcpOAuthAuthorize: createAuthEndpoint(
				"/mcp/authorize",
				{
					method: "GET",
					query: z.record(z.string(), z.any()),
					metadata: {
						openapi: {
							description: "Authorize an OAuth2 request using MCP",
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
					return authorizeMCPOAuth(ctx, opts);
				},
			),
			mcpOAuthToken: createAuthEndpoint(
				"/mcp/token",
				{
					method: "POST",
					body: mcpOAuthTokenBodySchema,
					metadata: {
						isAction: false,
						allowedMediaTypes: [
							"application/x-www-form-urlencoded",
							"application/json",
						],
					},
				},
				async (ctx) => {
					//cors
					ctx.setHeader("Access-Control-Allow-Origin", "*");
					ctx.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
					ctx.setHeader(
						"Access-Control-Allow-Headers",
						"Content-Type, Authorization",
					);
					ctx.setHeader("Access-Control-Max-Age", "86400");

					let { body } = ctx;
					if (!body) {
						throw ctx.error("BAD_REQUEST", {
							error_description: "request body not found",
							error: "invalid_request",
						});
					}
					if (body instanceof FormData) {
						body = Object.fromEntries(body.entries());
					}
					if (!(body instanceof Object)) {
						throw new APIError("BAD_REQUEST", {
							error_description: "request body is not an object",
							error: "invalid_request",
						});
					}
					let { client_id, client_secret } = body;
					const authorization =
						ctx.request?.headers.get("authorization") || null;
					if (
						authorization &&
						!client_id &&
						!client_secret &&
						authorization.startsWith("Basic ")
					) {
						try {
							const encoded = authorization.replace("Basic ", "");
							const decoded = new TextDecoder().decode(base64.decode(encoded));
							if (!decoded.includes(":")) {
								throw new APIError("UNAUTHORIZED", {
									error_description: "invalid authorization header format",
									error: "invalid_client",
								});
							}
							const [id, secret] = decoded.split(":");
							if (!id || !secret) {
								throw new APIError("UNAUTHORIZED", {
									error_description: "invalid authorization header format",
									error: "invalid_client",
								});
							}
							client_id = id;
							client_secret = secret;
						} catch (error) {
							throw new APIError("UNAUTHORIZED", {
								error_description: "invalid authorization header format",
								error: "invalid_client",
							});
						}
					}
					const {
						grant_type,
						code,
						redirect_uri,
						refresh_token,
						code_verifier,
					} = body;
					if (grant_type === "refresh_token") {
						if (!refresh_token) {
							throw new APIError("BAD_REQUEST", {
								error_description: "refresh_token is required",
								error: "invalid_request",
							});
						}
						const token = await ctx.context.adapter.findOne<OAuthAccessToken>({
							model: "oauthAccessToken",
							where: [
								{
									field: "refreshToken",
									value: refresh_token.toString(),
								},
							],
						});
						if (!token) {
							throw new APIError("UNAUTHORIZED", {
								error_description: "invalid refresh token",
								error: "invalid_grant",
							});
						}
						if (token.clientId !== client_id?.toString()) {
							throw new APIError("UNAUTHORIZED", {
								error_description: "invalid client_id",
								error: "invalid_client",
							});
						}
						if (token.refreshTokenExpiresAt < new Date()) {
							throw new APIError("UNAUTHORIZED", {
								error_description: "refresh token expired",
								error: "invalid_grant",
							});
						}
						const accessToken = generateRandomString(32, "a-z", "A-Z");
						const newRefreshToken = generateRandomString(32, "a-z", "A-Z");
						const accessTokenExpiresAt = new Date(
							Date.now() + opts.accessTokenExpiresIn * 1000,
						);
						const refreshTokenExpiresAt = new Date(
							Date.now() + opts.refreshTokenExpiresIn * 1000,
						);
						await ctx.context.adapter.create({
							model: modelName.oauthAccessToken,
							data: {
								accessToken,
								refreshToken: newRefreshToken,
								accessTokenExpiresAt,
								refreshTokenExpiresAt,
								clientId: client_id.toString(),
								userId: token.userId,
								scopes: token.scopes,
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});
						return ctx.json({
							access_token: accessToken,
							token_type: "bearer",
							expires_in: opts.accessTokenExpiresIn,
							refresh_token: newRefreshToken,
							scope: token.scopes,
						});
					}

					if (!code) {
						throw new APIError("BAD_REQUEST", {
							error_description: "code is required",
							error: "invalid_request",
						});
					}

					if (opts.requirePKCE && !code_verifier) {
						throw new APIError("BAD_REQUEST", {
							error_description: "code verifier is missing",
							error: "invalid_request",
						});
					}

					/**
					 * We need to check if the code is valid before we can proceed
					 * with the rest of the request.
					 */
					const verificationValue =
						await ctx.context.internalAdapter.findVerificationValue(
							code.toString(),
						);
					if (!verificationValue) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid code",
							error: "invalid_grant",
						});
					}
					if (verificationValue.expiresAt < new Date()) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "code expired",
							error: "invalid_grant",
						});
					}

					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);

					if (!client_id) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "client_id is required",
							error: "invalid_client",
						});
					}
					if (!grant_type) {
						throw new APIError("BAD_REQUEST", {
							error_description: "grant_type is required",
							error: "invalid_request",
						});
					}
					if (grant_type !== "authorization_code") {
						throw new APIError("BAD_REQUEST", {
							error_description: "grant_type must be 'authorization_code'",
							error: "unsupported_grant_type",
						});
					}

					if (!redirect_uri) {
						throw new APIError("BAD_REQUEST", {
							error_description: "redirect_uri is required",
							error: "invalid_request",
						});
					}

					const client = await ctx.context.adapter
						.findOne<Record<string, any>>({
							model: modelName.oauthClient,
							where: [{ field: "clientId", value: client_id.toString() }],
						})
						.then((res) => {
							if (!res) {
								return null;
							}
							return {
								...res,
								redirectUrls: res.redirectUrls.split(","),
								metadata: res.metadata ? JSON.parse(res.metadata) : {},
							} as Client;
						});
					if (!client) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid client_id",
							error: "invalid_client",
						});
					}
					if (client.disabled) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "client is disabled",
							error: "invalid_client",
						});
					}
					// For public clients (type: 'public'), validate PKCE instead of client_secret
					if (client.type === "public") {
						// Public clients must use PKCE
						if (!code_verifier) {
							throw new APIError("BAD_REQUEST", {
								error_description:
									"code verifier is required for public clients",
								error: "invalid_request",
							});
						}
						// PKCE validation happens later in the flow, so we skip client_secret validation
					} else {
						// For confidential clients, validate client_secret
						if (!client_secret) {
							throw new APIError("UNAUTHORIZED", {
								error_description:
									"client_secret is required for confidential clients",
								error: "invalid_client",
							});
						}
						const isValidSecret =
							client.clientSecret === client_secret.toString();
						if (!isValidSecret) {
							throw new APIError("UNAUTHORIZED", {
								error_description: "invalid client_secret",
								error: "invalid_client",
							});
						}
					}
					const value = JSON.parse(
						verificationValue.value,
					) as CodeVerificationValue;
					if (value.clientId !== client_id.toString()) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid client_id",
							error: "invalid_client",
						});
					}
					if (value.redirectURI !== redirect_uri.toString()) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid redirect_uri",
							error: "invalid_client",
						});
					}
					if (value.codeChallenge && !code_verifier) {
						throw new APIError("BAD_REQUEST", {
							error_description: "code verifier is missing",
							error: "invalid_request",
						});
					}

					const challenge =
						value.codeChallengeMethod === "plain"
							? code_verifier
							: await createHash("SHA-256", "base64urlnopad").digest(
									code_verifier,
								);

					if (challenge !== value.codeChallenge) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "code verification failed",
							error: "invalid_request",
						});
					}

					const requestedScopes = value.scope;
					await ctx.context.internalAdapter.deleteVerificationValue(
						verificationValue.id,
					);
					const accessToken = generateRandomString(32, "a-z", "A-Z");
					const refreshToken = generateRandomString(32, "A-Z", "a-z");
					const accessTokenExpiresAt = new Date(
						Date.now() + opts.accessTokenExpiresIn * 1000,
					);
					const refreshTokenExpiresAt = new Date(
						Date.now() + opts.refreshTokenExpiresIn * 1000,
					);
					await ctx.context.adapter.create({
						model: modelName.oauthAccessToken,
						data: {
							accessToken,
							refreshToken,
							accessTokenExpiresAt,
							refreshTokenExpiresAt,
							clientId: client_id.toString(),
							userId: value.userId,
							scopes: requestedScopes.join(" "),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
					const user = await ctx.context.internalAdapter.findUserById(
						value.userId,
					);
					if (!user) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "user not found",
							error: "invalid_grant",
						});
					}
					let secretKey = {
						alg: "HS256",
						key: await getWebcryptoSubtle().generateKey(
							{
								name: "HMAC",
								hash: "SHA-256",
							},
							true,
							["sign", "verify"],
						),
					};
					const profile = {
						given_name: user.name.split(" ")[0]!,
						family_name: user.name.split(" ")[1]!,
						name: user.name,
						profile: user.image,
						updated_at: Math.floor(new Date(user.updatedAt).getTime() / 1000),
					};
					const email = {
						email: user.email,
						email_verified: user.emailVerified,
					};
					const userClaims = {
						...(requestedScopes.includes("profile") ? profile : {}),
						...(requestedScopes.includes("email") ? email : {}),
					};

					const additionalUserClaims = opts.getAdditionalUserInfoClaim
						? await opts.getAdditionalUserInfoClaim(
								user,
								requestedScopes,
								client,
							)
						: {};

					const idToken = await new SignJWT({
						sub: user.id,
						aud: client_id.toString(),
						iat: Date.now(),
						auth_time: ctx.context.session
							? new Date(ctx.context.session.session.createdAt).getTime()
							: undefined,
						nonce: value.nonce,
						acr: "urn:mace:incommon:iap:silver", // default to silver - ⚠︎ this should be configurable and should be validated against the client's metadata
						...userClaims,
						...additionalUserClaims,
					})
						.setProtectedHeader({ alg: secretKey.alg })
						.setIssuedAt()
						.setExpirationTime(
							Math.floor(Date.now() / 1000) + opts.accessTokenExpiresIn,
						)
						.sign(secretKey.key);
					return ctx.json(
						{
							access_token: accessToken,
							token_type: "Bearer",
							expires_in: opts.accessTokenExpiresIn,
							refresh_token: requestedScopes.includes("offline_access")
								? refreshToken
								: undefined,
							scope: requestedScopes.join(" "),
							id_token: requestedScopes.includes("openid")
								? idToken
								: undefined,
						},
						{
							headers: {
								"Cache-Control": "no-store",
								Pragma: "no-cache",
							},
						},
					);
				},
			),
			registerMcpClient: createAuthEndpoint(
				"/mcp/register",
				{
					method: "POST",
					body: registerMcpClientBodySchema,
					metadata: {
						openapi: {
							description: "Register an OAuth2 application",
							responses: {
								"200": {
									description: "OAuth2 application registered successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													name: {
														type: "string",
														description: "Name of the OAuth2 application",
													},
													icon: {
														type: "string",
														nullable: true,
														description: "Icon URL for the application",
													},
													metadata: {
														type: "object",
														additionalProperties: true,
														nullable: true,
														description:
															"Additional metadata for the application",
													},
													clientId: {
														type: "string",
														description: "Unique identifier for the client",
													},
													clientSecret: {
														type: "string",
														description:
															"Secret key for the client. Not included for public clients.",
													},
													redirectUrls: {
														type: "array",
														items: { type: "string", format: "uri" },
														description: "List of allowed redirect URLs",
													},
													type: {
														type: "string",
														description: "Type of the client",
														enum: ["web", "public"],
													},
													authenticationScheme: {
														type: "string",
														description:
															"Authentication scheme used by the client",
														enum: ["client_secret", "none"],
													},
													disabled: {
														type: "boolean",
														description: "Whether the client is disabled",
														enum: [false],
													},
													userId: {
														type: "string",
														nullable: true,
														description:
															"ID of the user who registered the client, null if registered anonymously",
													},
													createdAt: {
														type: "string",
														format: "date-time",
														description: "Creation timestamp",
													},
													updatedAt: {
														type: "string",
														format: "date-time",
														description: "Last update timestamp",
													},
												},
												required: [
													"name",
													"clientId",
													"redirectUrls",
													"type",
													"authenticationScheme",
													"disabled",
													"createdAt",
													"updatedAt",
												],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const body = ctx.body;
					const session = await getSessionFromCtx(ctx);
					ctx.setHeader("Access-Control-Allow-Origin", "*");
					ctx.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
					ctx.setHeader(
						"Access-Control-Allow-Headers",
						"Content-Type, Authorization",
					);
					ctx.setHeader("Access-Control-Max-Age", "86400");
					ctx.headers?.set("Access-Control-Max-Age", "86400");
					if (
						(!body.grant_types ||
							body.grant_types.includes("authorization_code") ||
							body.grant_types.includes("implicit")) &&
						(!body.redirect_uris || body.redirect_uris.length === 0)
					) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_redirect_uri",
							error_description:
								"Redirect URIs are required for authorization_code and implicit grant types",
						});
					}

					if (body.grant_types && body.response_types) {
						if (
							body.grant_types.includes("authorization_code") &&
							!body.response_types.includes("code")
						) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_client_metadata",
								error_description:
									"When 'authorization_code' grant type is used, 'code' response type must be included",
							});
						}
						if (
							body.grant_types.includes("implicit") &&
							!body.response_types.includes("token")
						) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_client_metadata",
								error_description:
									"When 'implicit' grant type is used, 'token' response type must be included",
							});
						}
					}

					const clientId =
						opts.generateClientId?.() || generateRandomString(32, "a-z", "A-Z");
					const clientSecret =
						opts.generateClientSecret?.() ||
						generateRandomString(32, "a-z", "A-Z");

					// Determine client type based on auth method
					const clientType =
						body.token_endpoint_auth_method === "none" ? "public" : "web";
					const finalClientSecret = clientType === "public" ? "" : clientSecret;

					await ctx.context.adapter.create({
						model: modelName.oauthClient,
						data: {
							name: body.client_name,
							icon: body.logo_uri,
							metadata: body.metadata ? JSON.stringify(body.metadata) : null,
							clientId: clientId,
							clientSecret: finalClientSecret,
							redirectUrls: body.redirect_uris.join(","),
							type: clientType,
							authenticationScheme:
								body.token_endpoint_auth_method || "client_secret_basic",
							disabled: false,
							userId: session?.session.userId,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					const responseData = {
						client_id: clientId,
						client_id_issued_at: Math.floor(Date.now() / 1000),
						redirect_uris: body.redirect_uris,
						token_endpoint_auth_method:
							body.token_endpoint_auth_method || "client_secret_basic",
						grant_types: body.grant_types || ["authorization_code"],
						response_types: body.response_types || ["code"],
						client_name: body.client_name,
						client_uri: body.client_uri,
						logo_uri: body.logo_uri,
						scope: body.scope,
						contacts: body.contacts,
						tos_uri: body.tos_uri,
						policy_uri: body.policy_uri,
						jwks_uri: body.jwks_uri,
						jwks: body.jwks,
						software_id: body.software_id,
						software_version: body.software_version,
						software_statement: body.software_statement,
						metadata: body.metadata,
						...(clientType !== "public"
							? {
									client_secret: finalClientSecret,
									client_secret_expires_at: 0, // 0 means it doesn't expire
								}
							: {}),
					};

					return new Response(JSON.stringify(responseData), {
						status: 201,
						headers: {
							"Content-Type": "application/json",
							"Cache-Control": "no-store",
							Pragma: "no-cache",
						},
					});
				},
			),
			getMcpSession: createAuthEndpoint(
				"/mcp/get-session",
				{
					method: "GET",
					requireHeaders: true,
				},
				async (c) => {
					const accessToken = c.headers
						?.get("Authorization")
						?.replace("Bearer ", "");
					if (!accessToken) {
						c.headers?.set("WWW-Authenticate", "Bearer");
						return c.json(null);
					}
					const accessTokenData =
						await c.context.adapter.findOne<OAuthAccessToken>({
							model: modelName.oauthAccessToken,
							where: [
								{
									field: "accessToken",
									value: accessToken,
								},
							],
						});
					if (!accessTokenData) {
						return c.json(null);
					}
					return c.json(accessTokenData);
				},
			),
		},
		schema,
	} satisfies BetterAuthPlugin;
};

export const withMcpAuth = <
	Auth extends {
		api: {
			getMcpSession: (...args: any) => Promise<OAuthAccessToken | null>;
		};
		options: BetterAuthOptions;
	},
>(
	auth: Auth,
	handler: (
		req: Request,
		session: OAuthAccessToken,
	) => Response | Promise<Response>,
) => {
	return async (req: Request) => {
		const baseURL = getBaseURL(auth.options.baseURL, auth.options.basePath);
		if (!baseURL && !isProduction) {
			logger.warn("Unable to get the baseURL, please check your config!");
		}
		const session = await auth.api.getMcpSession({
			headers: req.headers,
		});
		const wwwAuthenticateValue = `Bearer resource_metadata="${baseURL}/.well-known/oauth-protected-resource"`;
		if (!session) {
			return Response.json(
				{
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Unauthorized: Authentication required",
						"www-authenticate": wwwAuthenticateValue,
					},
					id: null,
				},
				{
					status: 401,
					headers: {
						"WWW-Authenticate": wwwAuthenticateValue,
						// we also add this headers otherwise browser based clients will not be able to read the `www-authenticate` header
						"Access-Control-Expose-Headers": "WWW-Authenticate",
					},
				},
			);
		}
		return handler(req, session);
	};
};

export const oAuthDiscoveryMetadata = <
	Auth extends {
		api: {
			getMcpOAuthConfig: (...args: any) => any;
		};
	},
>(
	auth: Auth,
) => {
	return async (request: Request) => {
		const res = await auth.api.getMcpOAuthConfig();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	};
};

export const oAuthProtectedResourceMetadata = <
	Auth extends {
		api: {
			getMCPProtectedResource: (...args: any) => any;
		};
	},
>(
	auth: Auth,
) => {
	return async (request: Request) => {
		const res = await auth.api.getMCPProtectedResource();
		return new Response(JSON.stringify(res), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "POST, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization",
				"Access-Control-Max-Age": "86400",
			},
		});
	};
};
