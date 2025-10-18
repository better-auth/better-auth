import * as z from "zod";
import { SignJWT } from "jose";
import { APIError, getSessionFromCtx, sessionMiddleware } from "../../api";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { BetterAuthPlugin } from "@better-auth/core";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import { schema } from "./schema";
import type {
	Client,
	CodeVerificationValue,
	OAuthAccessToken,
	OIDCMetadata,
	OIDCOptions,
} from "./types";
import { authorize } from "./authorize";
import { parseSetCookieHeader } from "../../cookies";
import { createHash } from "@better-auth/utils/hash";
import { base64 } from "@better-auth/utils/base64";
import { getJwtToken } from "../jwt/sign";
import type { jwt } from "../jwt";
import { defaultClientSecretHasher } from "./utils";
import { mergeSchema } from "../../db";
import type { GenericEndpointContext } from "@better-auth/core";

const getJwtPlugin = (ctx: GenericEndpointContext) => {
	return ctx.context.options.plugins?.find(
		(plugin) => plugin.id === "jwt",
	) as ReturnType<typeof jwt>;
};

/**
 * Get a client by ID, checking trusted clients first, then database
 */
export async function getClient(
	clientId: string,
	adapter: any,
	trustedClients: (Client & { skipConsent?: boolean })[] = [],
): Promise<(Client & { skipConsent?: boolean }) | null> {
	const trustedClient = trustedClients.find(
		(client) => client.clientId === clientId,
	);
	if (trustedClient) {
		return trustedClient;
	}
	const dbClient = await adapter
		.findOne({
			model: "oauthApplication",
			where: [{ field: "clientId", value: clientId }],
		})
		.then((res: Record<string, any> | null) => {
			if (!res) {
				return null;
			}
			return {
				...res,
				redirectURLs: (res.redirectURLs ?? "").split(","),
				metadata: res.metadata ? JSON.parse(res.metadata) : {},
			} as Client;
		});

	return dbClient;
}

export const getMetadata = (
	ctx: GenericEndpointContext,
	options?: OIDCOptions,
): OIDCMetadata => {
	const jwtPlugin = getJwtPlugin(ctx);
	const issuer =
		jwtPlugin && jwtPlugin.options?.jwt && jwtPlugin.options.jwt.issuer
			? jwtPlugin.options.jwt.issuer
			: (ctx.context.options.baseURL as string);
	const baseURL = ctx.context.baseURL;
	const supportedAlgs = options?.useJWTPlugin
		? ["RS256", "EdDSA", "none"]
		: ["HS256", "none"];
	return {
		issuer,
		authorization_endpoint: `${baseURL}/oauth2/authorize`,
		token_endpoint: `${baseURL}/oauth2/token`,
		userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
		jwks_uri: `${baseURL}/jwks`,
		registration_endpoint: `${baseURL}/oauth2/register`,
		scopes_supported: ["openid", "profile", "email", "offline_access"],
		response_types_supported: ["code"],
		response_modes_supported: ["query"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		acr_values_supported: [
			"urn:mace:incommon:iap:silver",
			"urn:mace:incommon:iap:bronze",
		],
		subject_types_supported: ["public"],
		id_token_signing_alg_values_supported: supportedAlgs,
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

/**
 * OpenID Connect (OIDC) plugin for Better Auth. This plugin implements the
 * authorization code flow and the token exchange flow. It also implements the
 * userinfo endpoint.
 *
 * @param options - The options for the OIDC plugin.
 * @returns A Better Auth plugin.
 *
 * @deprecated Use [oauthProvider](../oauth-provider/index.ts) instead
 */
export const oidcProvider = (options: OIDCOptions) => {
	const modelName = {
		oauthClient: "oauthApplication",
		oauthAccessToken: "oauthAccessToken",
		oauthConsent: "oauthConsent",
	};

	const opts = {
		codeExpiresIn: 600,
		defaultScope: "openid",
		accessTokenExpiresIn: 3600,
		refreshTokenExpiresIn: 604800,
		allowPlainCodeChallengeMethod: true,
		storeClientSecret: "plain" as const,
		...options,
		scopes: [
			"openid",
			"profile",
			"email",
			"offline_access",
			...(options?.scopes || []),
		],
	};

	const trustedClients = options.trustedClients || [];

	/**
	 * Store client secret according to the configured storage method
	 */
	async function storeClientSecret(
		ctx: GenericEndpointContext,
		clientSecret: string,
	) {
		if (opts.storeClientSecret === "encrypted") {
			return await symmetricEncrypt({
				key: ctx.context.secret,
				data: clientSecret,
			});
		}
		if (opts.storeClientSecret === "hashed") {
			return await defaultClientSecretHasher(clientSecret);
		}
		if (
			typeof opts.storeClientSecret === "object" &&
			"hash" in opts.storeClientSecret
		) {
			return await opts.storeClientSecret.hash(clientSecret);
		}
		if (
			typeof opts.storeClientSecret === "object" &&
			"encrypt" in opts.storeClientSecret
		) {
			return await opts.storeClientSecret.encrypt(clientSecret);
		}

		return clientSecret;
	}

	/**
	 * Verify stored client secret against provided client secret
	 */
	async function verifyStoredClientSecret(
		ctx: GenericEndpointContext,
		storedClientSecret: string,
		clientSecret: string,
	): Promise<boolean> {
		if (opts.storeClientSecret === "encrypted") {
			return (
				(await symmetricDecrypt({
					key: ctx.context.secret,
					data: storedClientSecret,
				})) === clientSecret
			);
		}
		if (opts.storeClientSecret === "hashed") {
			const hashedClientSecret = await defaultClientSecretHasher(clientSecret);
			return hashedClientSecret === storedClientSecret;
		}
		if (
			typeof opts.storeClientSecret === "object" &&
			"hash" in opts.storeClientSecret
		) {
			const hashedClientSecret =
				await opts.storeClientSecret.hash(clientSecret);
			return hashedClientSecret === storedClientSecret;
		}
		if (
			typeof opts.storeClientSecret === "object" &&
			"decrypt" in opts.storeClientSecret
		) {
			const decryptedClientSecret =
				await opts.storeClientSecret.decrypt(storedClientSecret);
			return decryptedClientSecret === clientSecret;
		}

		return clientSecret === storedClientSecret;
	}

	return {
		id: "oidc",
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
							await ctx.context.internalAdapter.findSession(sessionToken);
						if (!session) {
							return;
						}
						ctx.query = JSON.parse(cookie);
						// Don't force prompt to "consent" - let the authorize function
						// determine if consent is needed based on OIDC spec requirements
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
					const metadata = getMetadata(ctx, options);
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
						consent_code: z.string().optional().nullish(),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description:
								"Handle OAuth2 consent. Supports both URL parameter-based flows (consent_code in body) and cookie-based flows (signed cookie).",
							requestBody: {
								required: true,
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												accept: {
													type: "boolean",
													description:
														"Whether the user accepts or denies the consent request",
												},
												consent_code: {
													type: "string",
													description:
														"The consent code from the authorization request. Optional if using cookie-based flow.",
												},
											},
											required: ["accept"],
										},
									},
								},
							},
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
					// Support both consent flow methods:
					// 1. URL parameter-based: consent_code in request body (standard OAuth2 pattern)
					// 2. Cookie-based: using signed cookie for stateful consent flows
					let consentCode: string | null = ctx.body.consent_code || null;

					if (!consentCode) {
						// Check for cookie-based consent flow
						consentCode = await ctx.getSignedCookie(
							"oidc_consent_prompt",
							ctx.context.secret,
						);
					}

					if (!consentCode) {
						throw new APIError("UNAUTHORIZED", {
							error_description:
								"consent_code is required (either in body or cookie)",
							error: "invalid_request",
						});
					}

					const verification =
						await ctx.context.internalAdapter.findVerificationValue(
							consentCode,
						);
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

					// Clear the cookie
					ctx.setCookie("oidc_consent_prompt", "", {
						maxAge: 0,
					});

					const value = JSON.parse(verification.value) as CodeVerificationValue;
					if (!value.requireConsent) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "Consent not required",
							error: "invalid_request",
						});
					}

					if (!ctx.body.accept) {
						await ctx.context.internalAdapter.deleteVerificationValue(
							verification.id,
						);
						return ctx.json({
							redirectURI: `${value.redirectURI}?error=access_denied&error_description=User denied access`,
						});
					}
					const code = generateRandomString(32, "a-z", "A-Z", "0-9");
					const codeExpiresInMs = opts.codeExpiresIn * 1000;
					const expiresAt = new Date(Date.now() + codeExpiresInMs);
					await ctx.context.internalAdapter.updateVerificationValue(
						verification.id,
						{
							value: JSON.stringify({
								...value,
								requireConsent: false,
							}),
							identifier: code,
							expiresAt,
						},
					);
					await ctx.context.adapter.create({
						model: modelName.oauthConsent,
						data: {
							clientId: value.clientId,
							userId: value.userId,
							scopes: value.scope.join(" "),
							consentGiven: true,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
					const redirectURI = new URL(value.redirectURI);
					redirectURI.searchParams.set("code", code);
					if (value.state) redirectURI.searchParams.set("state", value.state);
					return ctx.json({
						redirectURI: redirectURI.toString(),
					});
				},
			),
			oAuth2token: createAuthEndpoint(
				"/oauth2/token",
				{
					method: "POST",
					body: z.record(z.any(), z.any()),
					metadata: {
						isAction: false,
					},
				},
				async (ctx) => {
					let { body } = ctx;
					if (!body) {
						throw new APIError("BAD_REQUEST", {
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

					const now = Date.now();
					const iat = Math.floor(now / 1000);
					const exp = iat + (opts.accessTokenExpiresIn ?? 3600);

					const accessTokenExpiresAt = new Date(exp * 1000);
					const refreshTokenExpiresAt = new Date(
						(iat + (opts.refreshTokenExpiresIn ?? 604800)) * 1000,
					);

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
							model: modelName.oauthAccessToken,
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
								createdAt: new Date(iat * 1000),
								updatedAt: new Date(iat * 1000),
							},
						});
						return ctx.json({
							access_token: accessToken,
							token_type: "Bearer",
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

					if (options.requirePKCE && !code_verifier) {
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

					const client = await getClient(
						client_id.toString(),
						ctx.context.adapter,
						trustedClients,
					);
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
					if (client.type === "public") {
						// For public clients (type: 'public'), validate PKCE instead of client_secret
						if (!code_verifier) {
							throw new APIError("BAD_REQUEST", {
								error_description:
									"code verifier is required for public clients",
								error: "invalid_request",
							});
						}
						// PKCE validation happens later in the flow, so we skip client_secret validation
					} else {
						if (!client.clientSecret || !client_secret) {
							throw new APIError("UNAUTHORIZED", {
								error_description:
									"client_secret is required for confidential clients",
								error: "invalid_client",
							});
						}
						const isValidSecret = await verifyStoredClientSecret(
							ctx,
							client.clientSecret,
							client_secret.toString(),
						);
						if (!isValidSecret) {
							throw new APIError("UNAUTHORIZED", {
								error_description: "invalid client_secret",
								error: "invalid_client",
							});
						}
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
							createdAt: new Date(iat * 1000),
							updatedAt: new Date(iat * 1000),
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

					const profile = {
						given_name: user.name.split(" ")[0]!,
						family_name: user.name.split(" ")[1]!,
						name: user.name,
						profile: user.image,
						updated_at: new Date(user.updatedAt).toISOString(),
					};
					const email = {
						email: user.email,
						email_verified: user.emailVerified,
					};
					const userClaims = {
						...(requestedScopes.includes("profile") ? profile : {}),
						...(requestedScopes.includes("email") ? email : {}),
					};

					const additionalUserClaims = options.getAdditionalUserInfoClaim
						? await options.getAdditionalUserInfoClaim(
								user,
								requestedScopes,
								client,
							)
						: {};

					const payload = {
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
					};
					const expirationTime =
						Math.floor(Date.now() / 1000) + opts.accessTokenExpiresIn;

					let idToken: string;

					// The JWT plugin is enabled, so we use the JWKS keys to sign
					if (options.useJWTPlugin) {
						const jwtPlugin = getJwtPlugin(ctx);
						if (!jwtPlugin) {
							ctx.context.logger.error(
								"OIDC: `useJWTPlugin` is enabled but the JWT plugin is not available. Make sure you have the JWT Plugin in your plugins array or set `useJWTPlugin` to false.",
							);
							throw new APIError("INTERNAL_SERVER_ERROR", {
								error_description: "JWT plugin is not enabled",
								error: "internal_server_error",
							});
						}
						idToken = await getJwtToken(
							{
								...ctx,
								context: {
									...ctx.context,
									session: {
										session: {
											id: generateRandomString(32, "a-z", "A-Z"),
											createdAt: new Date(iat * 1000),
											updatedAt: new Date(iat * 1000),
											userId: user.id,
											expiresAt: accessTokenExpiresAt,
											token: accessToken,
											ipAddress: ctx.request?.headers.get("x-forwarded-for"),
										},
										user,
									},
								},
							},
							{
								...jwtPlugin.options,
								jwt: {
									...jwtPlugin.options?.jwt,
									getSubject: () => user.id,
									audience: client_id.toString(),
									issuer: ctx.context.options.baseURL,
									expirationTime,
									definePayload: () => payload,
								},
							},
						);

						// If the JWT token is not enabled, create a key and use it to sign
					} else {
						idToken = await new SignJWT(payload)
							.setProtectedHeader({ alg: "HS256" })
							.setIssuedAt(iat)
							.setExpirationTime(accessTokenExpiresAt)
							.sign(new TextEncoder().encode(client.clientSecret));
					}

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
						await ctx.context.adapter.findOne<OAuthAccessToken>({
							model: modelName.oauthAccessToken,
							where: [
								{
									field: "accessToken",
									value: token,
								},
							],
						});
					if (!accessToken) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid access token",
							error: "invalid_token",
						});
					}
					if (accessToken.accessTokenExpiresAt < new Date()) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "The Access Token expired",
							error: "invalid_token",
						});
					}

					const client = await getClient(
						accessToken.clientId,
						ctx.context.adapter,
						trustedClients,
					);
					if (!client) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "client not found",
							error: "invalid_token",
						});
					}

					const user = await ctx.context.internalAdapter.findUserById(
						accessToken.userId,
					);
					if (!user) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "user not found",
							error: "invalid_token",
						});
					}
					const requestedScopes = accessToken.scopes.split(" ");
					const baseUserClaims = {
						sub: user.id,
						email: requestedScopes.includes("email") ? user.email : undefined,
						name: requestedScopes.includes("profile") ? user.name : undefined,
						picture: requestedScopes.includes("profile")
							? user.image
							: undefined,
						given_name: requestedScopes.includes("profile")
							? user.name.split(" ")[0]!
							: undefined,
						family_name: requestedScopes.includes("profile")
							? user.name.split(" ")[1]!
							: undefined,
						email_verified: requestedScopes.includes("email")
							? user.emailVerified
							: undefined,
					};
					const userClaims = options.getAdditionalUserInfoClaim
						? await options.getAdditionalUserInfoClaim(
								user,
								requestedScopes,
								client,
							)
						: baseUserClaims;
					return ctx.json({
						...baseUserClaims,
						...userClaims,
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/oauth2/register`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.registerOAuthApplication`
			 *
			 * **client:**
			 * `authClient.oauth2.register`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/oidc-provider#api-method-oauth2-register)
			 */
			registerOAuthApplication: createAuthEndpoint(
				"/oauth2/register",
				{
					method: "POST",
					body: z.object({
						redirect_uris: z.array(z.string()).meta({
							description:
								'A list of redirect URIs. Eg: ["https://client.example.com/callback"]',
						}),
						token_endpoint_auth_method: z
							.enum(["none", "client_secret_basic", "client_secret_post"])
							.meta({
								description:
									'The authentication method for the token endpoint. Eg: "client_secret_basic"',
							})
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
							.meta({
								description:
									'The grant types supported by the application. Eg: ["authorization_code"]',
							})
							.default(["authorization_code"])
							.optional(),
						response_types: z
							.array(z.enum(["code", "token"]))
							.meta({
								description:
									'The response types supported by the application. Eg: ["code"]',
							})
							.default(["code"])
							.optional(),
						client_name: z
							.string()
							.meta({
								description: 'The name of the application. Eg: "My App"',
							})
							.optional(),
						client_uri: z
							.string()
							.meta({
								description:
									'The URI of the application. Eg: "https://client.example.com"',
							})
							.optional(),
						logo_uri: z
							.string()
							.meta({
								description:
									'The URI of the application logo. Eg: "https://client.example.com/logo.png"',
							})
							.optional(),
						scope: z
							.string()
							.meta({
								description:
									'The scopes supported by the application. Separated by spaces. Eg: "profile email"',
							})
							.optional(),
						contacts: z
							.array(z.string())
							.meta({
								description:
									'The contact information for the application. Eg: ["admin@example.com"]',
							})
							.optional(),
						tos_uri: z
							.string()
							.meta({
								description:
									'The URI of the application terms of service. Eg: "https://client.example.com/tos"',
							})
							.optional(),
						policy_uri: z
							.string()
							.meta({
								description:
									'The URI of the application privacy policy. Eg: "https://client.example.com/policy"',
							})
							.optional(),
						jwks_uri: z
							.string()
							.meta({
								description:
									'The URI of the application JWKS. Eg: "https://client.example.com/jwks"',
							})
							.optional(),
						jwks: z
							.record(z.any(), z.any())
							.meta({
								description:
									'The JWKS of the application. Eg: {"keys": [{"kty": "RSA", "alg": "RS256", "use": "sig", "n": "...", "e": "..."}]}',
							})
							.optional(),
						metadata: z
							.record(z.any(), z.any())
							.meta({
								description:
									'The metadata of the application. Eg: {"key": "value"}',
							})
							.optional(),
						software_id: z
							.string()
							.meta({
								description:
									'The software ID of the application. Eg: "my-software"',
							})
							.optional(),
						software_version: z
							.string()
							.meta({
								description:
									'The software version of the application. Eg: "1.0.0"',
							})
							.optional(),
						software_statement: z
							.string()
							.meta({
								description: "The software statement of the application.",
							})
							.optional(),
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
														description: "Secret key for the client",
													},
													redirectURLs: {
														type: "array",
														items: { type: "string", format: "uri" },
														description: "List of allowed redirect URLs",
													},
													type: {
														type: "string",
														description: "Type of the client",
														enum: ["web"],
													},
													authenticationScheme: {
														type: "string",
														description:
															"Authentication scheme used by the client",
														enum: ["client_secret"],
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
													"clientSecret",
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
					const body = ctx.body;
					const session = await getSessionFromCtx(ctx);

					// Check authorization
					if (!session && !options.allowDynamicClientRegistration) {
						throw new APIError("UNAUTHORIZED", {
							error: "invalid_token",
							error_description:
								"Authentication required for client registration",
						});
					}

					// Validate redirect URIs for redirect-based flows
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

					// Validate correlation between grant_types and response_types
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
						options.generateClientId?.() ||
						generateRandomString(32, "a-z", "A-Z");
					const clientSecret =
						options.generateClientSecret?.() ||
						generateRandomString(32, "a-z", "A-Z");

					const storedClientSecret = await storeClientSecret(ctx, clientSecret);

					// Create the client with the existing schema
					const client: Client = await ctx.context.adapter.create({
						model: modelName.oauthClient,
						data: {
							name: body.client_name,
							icon: body.logo_uri,
							metadata: body.metadata ? JSON.stringify(body.metadata) : null,
							clientId: clientId,
							clientSecret: storedClientSecret,
							redirectURLs: body.redirect_uris.join(","),
							type: "web",
							authenticationScheme:
								body.token_endpoint_auth_method || "client_secret_basic",
							disabled: false,
							userId: session?.session.userId,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					// Format the response according to RFC7591
					return ctx.json(
						{
							client_id: clientId,
							...(client.type !== "public"
								? {
										client_secret: clientSecret,
										client_secret_expires_at: 0, // 0 means it doesn't expire
									}
								: {}),
							client_id_issued_at: Math.floor(Date.now() / 1000),
							client_secret_expires_at: 0, // 0 means it doesn't expire
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
						},
						{
							status: 201,
							headers: {
								"Cache-Control": "no-store",
								Pragma: "no-cache",
							},
						},
					);
				},
			),
			getOAuthClient: createAuthEndpoint(
				"/oauth2/client/:id",
				{
					method: "GET",
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Get OAuth2 client details",
							responses: {
								"200": {
									description: "OAuth2 client retrieved successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													clientId: {
														type: "string",
														description: "Unique identifier for the client",
													},
													name: {
														type: "string",
														description: "Name of the OAuth2 application",
													},
													icon: {
														type: "string",
														nullable: true,
														description: "Icon URL for the application",
													},
												},
												required: ["clientId", "name"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const client = await getClient(
						ctx.params.id,
						ctx.context.adapter,
						trustedClients,
					);
					if (!client) {
						throw new APIError("NOT_FOUND", {
							error_description: "client not found",
							error: "not_found",
						});
					}
					return ctx.json({
						clientId: client.clientId as string,
						name: client.name as string,
						icon: client.icon as string,
					});
				},
			),
		},
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};
export type * from "./types";
