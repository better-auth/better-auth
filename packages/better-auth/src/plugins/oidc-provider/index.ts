import * as z from "zod/v4";
import { SignJWT } from "jose";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin, GenericEndpointContext } from "../../types";
import { generateRandomString, symmetricDecrypt } from "../../crypto";
import { schema } from "./schema";
import type {
	CodeVerificationValue,
	OAuthAccessToken,
	OIDCMetadata,
	OIDCOptions,
	SchemaClient,
} from "./types";
import { authorize } from "./authorize";
import { parseSetCookieHeader } from "../../cookies";
import { createHash } from "@better-auth/utils/hash";
import { base64 } from "@better-auth/utils/base64";
import { getJwtToken } from "../jwt/sign";
import type { JwtOptions } from "../jwt";
import { defaultClientSecretHasher } from "./utils";
import { mergeSchema } from "../../db";
import { registerEndpoint } from "./register";

const getJwtPlugin = (ctx: GenericEndpointContext) => {
	return ctx.context.options.plugins?.find(
		(plugin) => plugin.id === "jwt",
	) as Omit<BetterAuthPlugin, "options"> & { options?: JwtOptions };
};

/**
 * Get a client by ID, checking trusted clients first, then database
 */
export async function getClient(
	ctx: GenericEndpointContext,
	opts: OIDCOptions,
	clientId: string,
): Promise<(SchemaClient & { skipConsent?: boolean }) | null> {
	const trustedClient = opts.trustedClients?.find(
		(client) => client.clientId === clientId,
	);
	if (trustedClient) {
		return {
			...trustedClient,
			skipConsent: true,
		};
	}

	const dbClient = await ctx.context.adapter
		.findOne({
			model: opts.schema?.oauthApplication?.modelName ?? "oauthApplication",
			where: [{ field: "clientId", value: clientId }],
		})
		.then((res) => {
			if (!res) return null;
			const record = res as Record<string, string | null>;
			return {
				...record,
				contacts: record.contacts?.split(",") ?? undefined,
				grantTypes: record.grantTypes?.split(",") ?? undefined,
				responseTypes: record.responseTypes?.split(",") ?? undefined,
				redirectURLs: record?.redirectURLs?.split(",") ?? undefined,
			} as SchemaClient;
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
 */
export const oidcProvider = (options: OIDCOptions) => {
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

	/**
	 * Verify stored client secret against provided client secret
	 */
	async function verifyStoredClientSecret(
		ctx: GenericEndpointContext,
		opts: OIDCOptions,
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
					const verification =
						await ctx.context.internalAdapter.findVerificationValue(storedCode);
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
						model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
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
							model:
								opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
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

					const client = await getClient(ctx, options, client_id.toString());
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
					if (client.public) {
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
							options,
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

					const additionalUserClaims = options.getAdditionalUserInfoClaim
						? await options.getAdditionalUserInfoClaim(user, requestedScopes)
						: {};

					const payload = {
						sub: user.id,
						aud: client_id.toString(),
						iat: Date.now(),
						auth_time: ctx.context.session?.session.createdAt.getTime(),
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
											createdAt: new Date(),
											updatedAt: new Date(),
											userId: user.id,
											expiresAt: new Date(
												Date.now() + opts.accessTokenExpiresIn * 1000,
											),
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
							.setIssuedAt()
							.setExpirationTime(expirationTime)
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
							model:
								opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
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
							? user.name.split(" ")[0]
							: undefined,
						family_name: requestedScopes.includes("profile")
							? user.name.split(" ")[1]
							: undefined,
						email_verified: requestedScopes.includes("email")
							? user.emailVerified
							: undefined,
					};
					const userClaims = options.getAdditionalUserInfoClaim
						? await options.getAdditionalUserInfoClaim(user, requestedScopes)
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
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/oidc-provider#register-a-new-client)
			 */
			registerOAuthApplication: createAuthEndpoint(
				"/oauth2/register",
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
					const client = await getClient(ctx, options, ctx.params.id);
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
