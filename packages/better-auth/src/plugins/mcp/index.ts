import * as z from "zod/v4";
import {
	createAuthEndpoint,
	createAuthMiddleware,
	type BetterAuthPlugin,
} from "..";
import {
	oidcProvider,
	type SchemaClient,
	type CodeVerificationValue,
	type OAuthAccessToken,
	type OIDCMetadata,
	type OIDCOptions,
} from "../oidc-provider";
import { APIError } from "../../api";
import { base64 } from "@better-auth/utils/base64";
import { generateRandomString } from "../../crypto";
import { createHash } from "@better-auth/utils/hash";
import { subtle } from "@better-auth/utils";
import { SignJWT } from "jose";
import type { BetterAuthOptions, GenericEndpointContext } from "../../types";
import { parseSetCookieHeader } from "../../cookies";
import { schema } from "../oidc-provider/schema";
import { authorizeMCPOAuth } from "./authorize";
import { getBaseURL } from "../../utils/url";
import { isProduction } from "../../utils/env";
import { logger } from "../../utils";
import { registerEndpoint } from "../oidc-provider/register";

interface MCPOptions {
	loginPage: string;
	oidcConfig?: OIDCOptions;
}

export const getMCPProviderMetadata = (
	ctx: GenericEndpointContext,
	options?: OIDCOptions,
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
						const sessionToken = sessionCookie?.split(".")[0];
						if (!sessionToken) {
							return;
						}
						const session =
							await ctx.context.internalAdapter.findSession(sessionToken);
						if (!session) {
							return;
						}
						ctx.query = JSON.parse(cookie);
						ctx.query!.prompt = "consent";
						ctx.context.session = session;
						const response = await authorizeMCPOAuth(ctx, opts).catch((e) => {
							if (e instanceof APIError) {
								if (e.statusCode === 302) {
									return ctx.json({
										redirect: true,
										//@ts-expect-error
										url: e.headers.get("location"),
									});
								}
							}
							throw e;
						});
						return response;
					}),
				},
			],
		},
		endpoints: {
			getMcpOAuthConfig: createAuthEndpoint(
				"/.well-known/oauth-authorization-server",
				{
					method: "GET",
					metadata: {
						client: false,
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
			mcpOAuthAuthroize: createAuthEndpoint(
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
					body: z.record(z.any(), z.any()),
					metadata: {
						isAction: false,
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
							model:
								opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
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
							model:
								opts.schema?.oauthApplication?.modelName ?? "oauthApplication",
							where: [{ field: "clientId", value: client_id.toString() }],
						})
						.then((res) => {
							if (!res) {
								return null;
							}
							return {
								...res,
								contacts: res.contacts?.split(",") ?? undefined,
								grantTypes: res.grantTypes?.split(",") ?? undefined,
								responseTypes: res.responseTypes?.split(",") ?? undefined,
								redirectURLs: res?.redirectURLs?.split(",") ?? undefined,
							} as SchemaClient;
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
					if (client.public) {
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
						model:
							opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
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
						key: await subtle.generateKey(
							{
								name: "HMAC",
								hash: "SHA-256",
							},
							true,
							["sign", "verify"],
						),
					};
					const profile = {
						given_name: user.name.split(" ")[0],
						family_name: user.name.split(" ")[1],
						name: user.name,
						profile: user.image,
						updated_at: user.updatedAt.toISOString(),
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
						? opts.getAdditionalUserInfoClaim(user, requestedScopes)
						: {};

					const idToken = await new SignJWT({
						sub: user.id,
						aud: client_id.toString(),
						iat: Date.now(),
						auth_time: ctx.context.session?.session.createdAt.getTime(),
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
					body: z.object({
						client_secret_expires_at: z.number().default(0).optional(),
						scope: z.string().optional().meta({
							description:
								'The scopes supported by the application. Separated by spaces. Eg: "profile email"',
						}),
						client_name: z.string().optional().meta({
							description: 'The name of the application. Eg: "My App"',
						}),
						client_uri: z.string().optional().meta({
							description:
								'The URI of the application. Eg: "https://client.example.com"',
						}),
						logo_uri: z.string().optional().meta({
							description:
								'The URI of the application logo. Eg: "https://client.example.com/logo.png"',
						}),
						contacts: z.array(z.string()).optional().meta({
							description:
								'The contact information for the application. Eg: ["admin@example.com"]',
						}),
						tos_uri: z.string().optional().meta({
							description:
								'The URI of the application terms of service. Eg: "https://client.example.com/tos"',
						}),
						policy_uri: z.string().optional().meta({
							description:
								'The URI of the application privacy policy. Eg: "https://client.example.com/policy"',
						}),
						software_id: z.string().optional().meta({
							description:
								'The software ID of the application. Eg: "my-software"',
						}),
						software_version: z.string().optional().meta({
							description:
								'The software version of the application. Eg: "1.0.0"',
						}),
						software_statement: z.string().optional().meta({
							description: "The software statement of the application.",
						}),
						redirect_uris: z.array(z.string()).optional().meta({
							description:
								'A list of redirect URIs. Eg: ["https://client.example.com/callback"]',
						}),
						token_endpoint_auth_method: z
							.enum(["none", "client_secret_basic", "client_secret_post"])
							.default("client_secret_basic")
							.optional()
							.meta({
								description:
									'The authentication method for the token endpoint. Eg: "client_secret_basic"',
							}),
						grant_types: z
							.array(
								z.enum([
									"authorization_code",
									"client_credentials",
									"refresh_token",
								]),
							)
							.default(["authorization_code"])
							.optional()
							.meta({
								description:
									'The grant types supported by the application. Eg: ["authorization_code"]',
							}),
						response_types: z
							.array(z.enum(["code", "token"]))
							.default(["code"])
							.optional()
							.meta({
								description:
									'The response types supported by the application. Eg: ["code"]',
							}),
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
													redirectURLs: {
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
													"redirectURLs",
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
					return registerEndpoint(ctx, opts);
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
							model:
								opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
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
		sesssion: OAuthAccessToken,
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
		const wwwAuthenticateValue = `Bearer resource_metadata=${baseURL}/api/auth/.well-known/oauth-authorization-server`;
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
