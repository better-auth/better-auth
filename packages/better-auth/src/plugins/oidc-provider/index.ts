import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { getCurrentAuthContext } from "@better-auth/core/context";
import { base64 } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { OpenAPIParameter } from "better-call";
import { jwtVerify, SignJWT } from "jose";
import * as z from "zod";
import { APIError, getSessionFromCtx, sessionMiddleware } from "../../api";
import { parseSetCookieHeader } from "../../cookies";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import { mergeSchema } from "../../db";
import type { jwt } from "../jwt";
import { getJwtToken, verifyJWT } from "../jwt";
import { authorize } from "./authorize";
import type { OAuthApplication } from "./schema";
import { schema } from "./schema";
import type {
	Client,
	CodeVerificationValue,
	OAuthAccessToken,
	OIDCMetadata,
	OIDCOptions,
} from "./types";
import { defaultClientSecretHasher } from "./utils";
import { parsePrompt } from "./utils/prompt";

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
	trustedClients: (Client & { skipConsent?: boolean | undefined })[] = [],
): Promise<(Client & { skipConsent?: boolean | undefined }) | null> {
	const {
		context: { adapter },
	} = await getCurrentAuthContext();
	const trustedClient = trustedClients.find(
		(client) => client.clientId === clientId,
	);
	if (trustedClient) {
		return trustedClient;
	}
	return adapter
		.findOne<OAuthApplication>({
			model: "oauthApplication",
			where: [{ field: "clientId", value: clientId }],
		})
		.then((res) => {
			if (!res) {
				return null;
			}
			// omit sensitive fields
			return {
				clientId: res.clientId,
				clientSecret: res.clientSecret,
				type: res.type,
				name: res.name,
				icon: res.icon,
				disabled: res.disabled,
				redirectUrls: (res.redirectUrls ?? "").split(","),
				metadata: res.metadata ? JSON.parse(res.metadata) : {},
			} satisfies Client;
		});
}

export const getMetadata = (
	ctx: GenericEndpointContext,
	options?: OIDCOptions | undefined,
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
		end_session_endpoint: `${baseURL}/oauth2/endsession`,
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

const oAuthConsentBodySchema = z.object({
	accept: z.boolean(),
	consent_code: z.string().optional().nullish(),
});

const oAuth2TokenBodySchema = z.record(z.any(), z.any());

const registerOAuthApplicationBodySchema = z.object({
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
			description: 'The metadata of the application. Eg: {"key": "value"}',
		})
		.optional(),
	software_id: z
		.string()
		.meta({
			description: 'The software ID of the application. Eg: "my-software"',
		})
		.optional(),
	software_version: z
		.string()
		.meta({
			description: 'The software version of the application. Eg: "1.0.0"',
		})
		.optional(),
	software_statement: z
		.string()
		.meta({
			description: "The software statement of the application.",
		})
		.optional(),
});

const DEFAULT_CODE_EXPIRES_IN = 600;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 3600;
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = 604800;

/**
 * OpenID Connect (OIDC) plugin for Better Auth. This plugin implements the
 * authorization code flow and the token exchange flow. It also implements the
 * userinfo endpoint.
 *
 * @param options - The options for the OIDC plugin.
 * @returns A Better Auth plugin.
 */
export const oidcProvider = (options: OIDCOptions) => {
	const modelName = {
		oauthClient: "oauthApplication",
		oauthAccessToken: "oauthAccessToken",
		oauthConsent: "oauthConsent",
	};

	const opts = {
		codeExpiresIn: DEFAULT_CODE_EXPIRES_IN,
		defaultScope: "openid",
		accessTokenExpiresIn: DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
		refreshTokenExpiresIn: DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
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
						const loginPromptCookie = await ctx.getSignedCookie(
							"oidc_login_prompt",
							ctx.context.secret,
						);
						const cookieName = ctx.context.authCookies.sessionToken.name;
						const parsedSetCookieHeader = parseSetCookieHeader(
							ctx.context.responseHeaders?.get("set-cookie") || "",
						);
						const hasSessionToken = parsedSetCookieHeader.has(cookieName);
						if (!loginPromptCookie || !hasSessionToken) {
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
						ctx.query = JSON.parse(loginPromptCookie);

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
					operationId: "getOpenIdConfig",
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
					operationId: "oauth2Authorize",
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
					operationId: "oauth2Consent",
					body: oAuthConsentBodySchema,
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
						const cookieValue = await ctx.getSignedCookie(
							"oidc_consent_prompt",
							ctx.context.secret,
						);
						if (cookieValue) {
							consentCode = cookieValue;
						}
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
					const codeExpiresInMs =
						(opts?.codeExpiresIn ?? DEFAULT_CODE_EXPIRES_IN) * 1000;
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
					operationId: "oauth2Token",
					body: oAuth2TokenBodySchema,
					metadata: {
						isAction: false,
						allowedMediaTypes: [
							"application/x-www-form-urlencoded",
							"application/json",
						],
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

					const client = await getClient(client_id.toString(), trustedClients);
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
						iat: iat,
						auth_time: ctx.context.session
							? new Date(ctx.context.session.session.createdAt).getTime()
							: undefined,
						nonce: value.nonce,
						acr: "urn:mace:incommon:iap:silver", // default to silver - ⚠︎ this should be configurable and should be validated against the client's metadata
						...userClaims,
						...additionalUserClaims,
					};
					const expirationTime =
						Math.floor(Date.now() / 1000) +
						(opts?.accessTokenExpiresIn ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN);

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
									issuer:
										jwtPlugin.options?.jwt?.issuer ??
										ctx.context.options.baseURL,
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
					operationId: "oauth2Userinfo",
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

					const client = await getClient(accessToken.clientId, trustedClients);
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
					body: registerOAuthApplicationBodySchema,
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
							redirectUrls: body.redirect_uris.join(","),
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
				async (
					ctx,
				): Promise<{
					clientId: string;
					name: string;
					icon: string | null;
				}> => {
					const client = await getClient(ctx.params.id, trustedClients);
					if (!client) {
						throw new APIError("NOT_FOUND", {
							error_description: "client not found",
							error: "not_found",
						});
					}
					return ctx.json({
						clientId: client.clientId,
						name: client.name,
						icon: client.icon || null,
					});
				},
			),
			/**
			 * ### Endpoint
			 *
			 * GET/POST `/oauth2/endsession`
			 *
			 * Implements RP-Initiated Logout as per OpenID Connect RP-Initiated Logout 1.0.
			 * Allows relying parties to request that an OpenID Provider log out the end-user.
			 *
			 * @see [OpenID Connect RP-Initiated Logout Spec](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
			 */
			endSession: createAuthEndpoint(
				"/oauth2/endsession",
				{
					method: ["GET", "POST"],
					query: z
						.object({
							id_token_hint: z.string().optional(),
							logout_hint: z.string().optional(),
							client_id: z.string().optional(),
							post_logout_redirect_uri: z.string().optional(),
							state: z.string().optional(),
							ui_locales: z.string().optional(),
						})
						.optional(),
					metadata: {
						isAction: false,
						openapi: {
							description:
								"RP-Initiated Logout endpoint. Logs out the end-user and optionally redirects to a post-logout URI.",
							parameters: [
								{
									name: "id_token_hint",
									in: "query",
									description:
										"Previously issued ID Token passed as a hint about the End-User's current authenticated session",
									required: false,
									schema: { type: "string" },
								},
								{
									name: "logout_hint",
									in: "query",
									description:
										"Hint to the Authorization Server about the End-User that is logging out",
									required: false,
									schema: { type: "string" },
								},
								{
									name: "client_id",
									in: "query",
									description:
										"OAuth 2.0 Client Identifier. Required if post_logout_redirect_uri is used without id_token_hint",
									required: false,
									schema: { type: "string" },
								},
								{
									name: "post_logout_redirect_uri",
									in: "query",
									description:
										"URL to which the RP is requesting that the End-User's User Agent be redirected after a logout has been performed",
									required: false,
									schema: { type: "string", format: "uri" },
								},
								{
									name: "state",
									in: "query",
									description:
										"Opaque value used by the RP to maintain state between the logout request and the callback",
									required: false,
									schema: { type: "string" },
								},
								{
									name: "ui_locales",
									in: "query",
									description:
										"End-User's preferred languages and scripts for the user interface",
									required: false,
									schema: { type: "string" },
								},
							] as OpenAPIParameter[],
							responses: {
								"302": {
									description:
										"Redirect to post_logout_redirect_uri or logout confirmation page",
								},
								"200": {
									description: "Logout completed successfully",
								},
							},
						},
					},
				},
				async (ctx) => {
					const {
						id_token_hint,
						logout_hint,
						client_id,
						post_logout_redirect_uri,
						state,
						ui_locales,
					} = ctx.query || {};

					let validatedClientId: string | null = null;
					let validatedUserId: string | null = null;

					// Validate id_token_hint if provided
					if (id_token_hint) {
						try {
							const jwtPlugin = getJwtPlugin(ctx);
							if (jwtPlugin && jwtPlugin.options && options?.useJWTPlugin) {
								// For JWT plugin tokens, verify using JWKS
								const verified = await verifyJWT(
									id_token_hint,
									jwtPlugin.options,
								);
								if (verified) {
									validatedUserId = verified.sub;
									validatedClientId = verified.aud
										? typeof verified.aud === "string"
											? verified.aud
											: verified.aud[0]!
										: null;
								}
							} else {
								// For HS256 tokens, we need the client_id to verify
								if (client_id) {
									const client = await getClient(client_id, trustedClients);
									if (client && client.clientSecret) {
										try {
											const { payload } = await jwtVerify(
												id_token_hint,
												new TextEncoder().encode(client.clientSecret),
											);
											validatedUserId = payload.sub as string;
											validatedClientId = payload.aud as string;
										} catch (error) {
											// Invalid token, continue with logout but no validation
										}
									}
								}
							}
						} catch (error) {
							// Invalid id_token_hint, but we continue with logout anyway
							ctx.context.logger.debug(
								"Invalid id_token_hint provided to end_session endpoint",
							);
						}
					}

					// Validate client_id if provided
					if (client_id) {
						const client = await getClient(client_id, trustedClients);
						if (!client) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_client",
								error_description: "Invalid client_id",
							});
						}
						// If we have a validated client from the token, ensure they match
						if (validatedClientId && validatedClientId !== client_id) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description:
									"client_id does not match the ID Token's audience",
							});
						}
						validatedClientId = client_id;
					}

					// Validate post_logout_redirect_uri if provided
					if (post_logout_redirect_uri) {
						if (!validatedClientId) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description:
									"client_id is required when using post_logout_redirect_uri without a valid id_token_hint",
							});
						}

						const client = await getClient(validatedClientId, trustedClients);
						if (!client) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_client",
								error_description: "Invalid client",
							});
						}

						const isValidRedirectUri = client.redirectUrls.some(
							(registeredUri) => post_logout_redirect_uri === registeredUri,
						);

						if (!isValidRedirectUri) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description:
									"post_logout_redirect_uri is not registered for this client",
							});
						}
					}

					const session = await getSessionFromCtx(ctx);

					if (validatedUserId || session) {
						const userId = validatedUserId || session?.user.id;
						if (userId) {
							await ctx.context.adapter.deleteMany({
								model: modelName.oauthAccessToken,
								where: [{ field: "userId", value: userId }],
							});
						}
					}

					if (session) {
						await ctx.context.internalAdapter.deleteSession(
							session.session.token,
						);
						ctx.setSignedCookie(
							ctx.context.authCookies.sessionToken.name,
							"",
							ctx.context.secret,
							{
								maxAge: 0,
							},
						);
					}

					if (post_logout_redirect_uri) {
						try {
							const redirectUrl = new URL(post_logout_redirect_uri);
							if (state) {
								redirectUrl.searchParams.set("state", state);
							}
							return ctx.redirect(redirectUrl.toString());
						} catch (error) {
							throw new APIError("BAD_REQUEST", {
								error: "invalid_request",
								error_description: "Invalid post_logout_redirect_uri format",
							});
						}
					}

					return ctx.json({
						success: true,
						message: "Logout successful",
					});
				},
			),
		},
		schema: mergeSchema(schema, options?.schema),
		get options() {
			return opts;
		},
	} satisfies BetterAuthPlugin;
};
export type * from "./types";
