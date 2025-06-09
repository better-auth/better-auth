import { z } from "zod";
import { APIError, createAuthEndpoint, sessionMiddleware } from "../../api";
import type { BetterAuthPlugin, User } from "../../types";
import {
	createAuthorizationURL,
	generateState,
	parseState,
	validateAuthorizationCode,
	validateToken,
	type OAuth2Tokens,
} from "../../oauth2";
import { betterFetch, BetterFetchError } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { setSessionCookie } from "../../cookies";

export interface SSOOptions {
	/**
	 * custom function to provision a user when they sign in with an SSO provider.
	 */
	provisionUser?: (data: {
		/**
		 * The user object from the database
		 */
		user: User & Record<string, any>;
		/**
		 * The user info object from the provider
		 */
		userInfo: Record<string, any>;
		/**
		 * The OAuth2 tokens from the provider
		 */
		token: OAuth2Tokens;
		/**
		 * The SSO provider
		 */
		provider: SSOProvider;
	}) => Promise<void>;
	/**
	 * Organization provisioning options
	 */
	organizationProvisioning?: {
		disabled?: boolean;
		defaultRole?: "member" | "admin";
		getRole?: (data: {
			/**
			 * The user object from the database
			 */
			user: User & Record<string, any>;
			/**
			 * The user info object from the provider
			 */
			userInfo: Record<string, any>;
			/**
			 * The OAuth2 tokens from the provider
			 */
			token: OAuth2Tokens;
			/**
			 * The SSO provider
			 */
			provider: SSOProvider;
		}) => Promise<"member" | "admin">;
	};
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Override user info with the provider info.
	 * @default false
	 */
	defaultOverrideUserInfo?: boolean;
}

export const sso = (options?: SSOOptions) => {
	return {
		id: "sso",
		endpoints: {
			createOIDCProvider: createAuthEndpoint(
				"/sso/register",
				{
					method: "POST",
					body: z.object({
						providerId: z.string({
							description:
								"The ID of the provider. This is used to identify the provider during login and callback",
						}),
						issuer: z.string({
							description:
								"The issuer url of the provider (e.g. https://idp.example.com)",
						}),
						domain: z.string({
							description:
								"The domain of the provider. This is used for email matching",
						}),
						clientId: z.string({
							description: "The client ID",
						}),
						clientSecret: z.string({
							description: "The client secret",
						}),
						authorizationEndpoint: z
							.string({
								description: "The authorization endpoint",
							})
							.optional(),
						tokenEndpoint: z
							.string({
								description: "The token endpoint",
							})
							.optional(),
						userInfoEndpoint: z
							.string({
								description: "The user info endpoint",
							})
							.optional(),
						tokenEndpointAuthentication: z
							.enum(["client_secret_post", "client_secret_basic"])
							.optional(),
						jwksEndpoint: z
							.string({
								description: "The JWKS endpoint",
							})
							.optional(),
						discoveryEndpoint: z.string().optional(),
						scopes: z
							.array(z.string(), {
								description:
									"The scopes to request. Defaults to ['openid', 'email', 'profile', 'offline_access']",
							})
							.optional(),
						pkce: z
							.boolean({
								description: "Whether to use PKCE for the authorization flow",
							})
							.default(true)
							.optional(),
						mapping: z
							.object({
								id: z.string({
									description:
										"The field in the user info response that contains the id. Defaults to 'sub'",
								}),
								email: z.string({
									description:
										"The field in the user info response that contains the email. Defaults to 'email'",
								}),
								emailVerified: z
									.string({
										description:
											"The field in the user info response that contains whether the email is verified. defaults to 'email_verified'",
									})
									.optional(),
								name: z.string({
									description:
										"The field in the user info response that contains the name. Defaults to 'name'",
								}),
								image: z
									.string({
										description:
											"The field in the user info response that contains the image. Defaults to 'picture'",
									})
									.optional(),
								extraFields: z.record(z.string()).optional(),
							})
							.optional(),
						organizationId: z
							.string({
								description:
									"If organization plugin is enabled, the organization id to link the provider to",
							})
							.optional(),
						overrideUserInfo: z
							.boolean({
								description:
									"Override user info with the provider info. Defaults to false",
							})
							.default(false)
							.optional(),
					}),
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							summary: "Register an OIDC provider",
							description:
								"This endpoint is used to register an OIDC provider. This is used to configure the provider and link it to an organization",
							responses: {
								"200": {
									description: "OIDC provider created successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													issuer: {
														type: "string",
														format: "uri",
														description: "The issuer URL of the provider",
													},
													domain: {
														type: "string",
														description:
															"The domain of the provider, used for email matching",
													},
													oidcConfig: {
														type: "object",
														properties: {
															issuer: {
																type: "string",
																format: "uri",
																description: "The issuer URL of the provider",
															},
															pkce: {
																type: "boolean",
																description:
																	"Whether PKCE is enabled for the authorization flow",
															},
															clientId: {
																type: "string",
																description: "The client ID for the provider",
															},
															clientSecret: {
																type: "string",
																description:
																	"The client secret for the provider",
															},
															authorizationEndpoint: {
																type: "string",
																format: "uri",
																nullable: true,
																description: "The authorization endpoint URL",
															},
															discoveryEndpoint: {
																type: "string",
																format: "uri",
																description: "The discovery endpoint URL",
															},
															userInfoEndpoint: {
																type: "string",
																format: "uri",
																nullable: true,
																description: "The user info endpoint URL",
															},
															scopes: {
																type: "array",
																items: { type: "string" },
																nullable: true,
																description:
																	"The scopes requested from the provider",
															},
															tokenEndpoint: {
																type: "string",
																format: "uri",
																nullable: true,
																description: "The token endpoint URL",
															},
															tokenEndpointAuthentication: {
																type: "string",
																enum: [
																	"client_secret_post",
																	"client_secret_basic",
																],
																nullable: true,
																description:
																	"Authentication method for the token endpoint",
															},
															jwksEndpoint: {
																type: "string",
																format: "uri",
																nullable: true,
																description: "The JWKS endpoint URL",
															},
															mapping: {
																type: "object",
																nullable: true,
																properties: {
																	id: {
																		type: "string",
																		description:
																			"Field mapping for user ID (defaults to 'sub')",
																	},
																	email: {
																		type: "string",
																		description:
																			"Field mapping for email (defaults to 'email')",
																	},
																	emailVerified: {
																		type: "string",
																		nullable: true,
																		description:
																			"Field mapping for email verification (defaults to 'email_verified')",
																	},
																	name: {
																		type: "string",
																		description:
																			"Field mapping for name (defaults to 'name')",
																	},
																	image: {
																		type: "string",
																		nullable: true,
																		description:
																			"Field mapping for image (defaults to 'picture')",
																	},
																	extraFields: {
																		type: "object",
																		additionalProperties: { type: "string" },
																		nullable: true,
																		description: "Additional field mappings",
																	},
																},
																required: ["id", "email", "name"],
															},
														},
														required: [
															"issuer",
															"pkce",
															"clientId",
															"clientSecret",
															"discoveryEndpoint",
														],
														description: "OIDC configuration for the provider",
													},
													organizationId: {
														type: "string",
														nullable: true,
														description:
															"ID of the linked organization, if any",
													},
													userId: {
														type: "string",
														description:
															"ID of the user who registered the provider",
													},
													providerId: {
														type: "string",
														description: "Unique identifier for the provider",
													},
													redirectURI: {
														type: "string",
														format: "uri",
														description:
															"The redirect URI for the provider callback",
													},
												},
												required: [
													"issuer",
													"domain",
													"oidcConfig",
													"userId",
													"providerId",
													"redirectURI",
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
					const issuerValidator = z.string().url();
					if (issuerValidator.safeParse(body.issuer).error) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid issuer. Must be a valid URL",
						});
					}
					const provider = await ctx.context.adapter.create({
						model: "ssoProvider",
						data: {
							issuer: body.issuer,
							domain: body.domain,
							oidcConfig: JSON.stringify({
								issuer: body.issuer,
								clientId: body.clientId,
								clientSecret: body.clientSecret,
								authorizationEndpoint: body.authorizationEndpoint,
								tokenEndpoint: body.tokenEndpoint,
								tokenEndpointAuthentication: body.tokenEndpointAuthentication,
								jwksEndpoint: body.jwksEndpoint,
								pkce: body.pkce,
								discoveryEndpoint:
									body.discoveryEndpoint ||
									`${body.issuer}/.well-known/openid-configuration`,
								mapping: body.mapping,
								scopes: body.scopes,
								userInfoEndpoint: body.userInfoEndpoint,
								overrideUserInfo:
									ctx.body.overrideUserInfo ||
									options?.defaultOverrideUserInfo ||
									false,
							}),
							organizationId: body.organizationId,
							userId: ctx.context.session.user.id,
							providerId: body.providerId,
						},
					});
					return ctx.json({
						...provider,
						oidcConfig: JSON.parse(provider.oidcConfig) as OIDCConfig,
						redirectURI: `${ctx.context.baseURL}/sso/callback/${provider.providerId}`,
					});
				},
			),
			signInSSO: createAuthEndpoint(
				"/sign-in/sso",
				{
					method: "POST",
					body: z.object({
						email: z
							.string({
								description:
									"The email address to sign in with. This is used to identify the issuer to sign in with. It's optional if the issuer is provided",
							})
							.optional(),
						organizationSlug: z
							.string({
								description: "The slug of the organization to sign in with",
							})
							.optional(),
						providerId: z
							.string({
								description:
									"The ID of the provider to sign in with. This can be provided instead of email or issuer",
							})
							.optional(),
						domain: z
							.string({
								description: "The domain of the provider.",
							})
							.optional(),
						callbackURL: z.string({
							description: "The URL to redirect to after login",
						}),
						errorCallbackURL: z
							.string({
								description: "The URL to redirect to after login",
							})
							.optional(),
						newUserCallbackURL: z
							.string({
								description:
									"The URL to redirect to after login if the user is new",
							})
							.optional(),
						scopes: z
							.array(z.string(), {
								description: "Scopes to request from the provider.",
							})
							.optional(),
						requestSignUp: z
							.boolean({
								description:
									"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							summary: "Sign in with SSO provider",
							description:
								"This endpoint is used to sign in with an SSO provider. It redirects to the provider's authorization URL",
							requestBody: {
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												email: {
													type: "string",
													description:
														"The email address to sign in with. This is used to identify the issuer to sign in with. It's optional if the issuer is provided",
												},
												issuer: {
													type: "string",
													description:
														"The issuer identifier, this is the URL of the provider and can be used to verify the provider and identify the provider during login. It's optional if the email is provided",
												},
												providerId: {
													type: "string",
													description:
														"The ID of the provider to sign in with. This can be provided instead of email or issuer",
												},
												callbackURL: {
													type: "string",
													description: "The URL to redirect to after login",
												},
												errorCallbackURL: {
													type: "string",
													description: "The URL to redirect to after login",
												},
												newUserCallbackURL: {
													type: "string",
													description:
														"The URL to redirect to after login if the user is new",
												},
											},
											required: ["callbackURL"],
										},
									},
								},
							},
							responses: {
								"200": {
									description:
										"Authorization URL generated successfully for SSO sign-in",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													url: {
														type: "string",
														format: "uri",
														description:
															"The authorization URL to redirect the user to for SSO sign-in",
													},
													redirect: {
														type: "boolean",
														description:
															"Indicates that the client should redirect to the provided URL",
														enum: [true],
													},
												},
												required: ["url", "redirect"],
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
					let { email, organizationSlug, providerId, domain } = body;
					if (!email && !organizationSlug && !domain && !providerId) {
						throw new APIError("BAD_REQUEST", {
							message:
								"email, organizationSlug, domain or providerId is required",
						});
					}
					domain = body.domain || email?.split("@")[1];
					let orgId = "";
					if (organizationSlug) {
						orgId = await ctx.context.adapter
							.findOne<{ id: string }>({
								model: "organization",
								where: [
									{
										field: "slug",
										value: organizationSlug,
									},
								],
							})
							.then((res) => {
								if (!res) {
									return "";
								}
								return res.id;
							});
					}
					const provider = await ctx.context.adapter
						.findOne<SSOProvider>({
							model: "ssoProvider",
							where: [
								{
									field: providerId
										? "providerId"
										: orgId
											? "organizationId"
											: "domain",
									value: providerId || orgId || domain!,
								},
							],
						})
						.then((res) => {
							if (!res) {
								return null;
							}
							return {
								...res,
								oidcConfig: JSON.parse(res.oidcConfig as unknown as string),
							};
						});
					if (!provider) {
						throw new APIError("NOT_FOUND", {
							message: "No provider found for the issuer",
						});
					}
					const state = await generateState(ctx);
					const redirectURI = `${ctx.context.baseURL}/sso/callback/${provider.providerId}`;
					const authorizationURL = await createAuthorizationURL({
						id: provider.issuer,
						options: {
							clientId: provider.oidcConfig.clientId,
							clientSecret: provider.oidcConfig.clientSecret,
						},
						redirectURI,
						state: state.state,
						codeVerifier: provider.oidcConfig.pkce
							? state.codeVerifier
							: undefined,
						scopes: ctx.body.scopes || [
							"openid",
							"email",
							"profile",
							"offline_access",
						],
						authorizationEndpoint: provider.oidcConfig.authorizationEndpoint,
					});
					return ctx.json({
						url: authorizationURL.toString(),
						redirect: true,
					});
				},
			),
			callbackSSO: createAuthEndpoint(
				"/sso/callback/:providerId",
				{
					method: "GET",
					query: z.object({
						code: z.string().optional(),
						state: z.string(),
						error: z.string().optional(),
						error_description: z.string().optional(),
					}),
					metadata: {
						isAction: false,
						openapi: {
							summary: "Callback URL for SSO provider",
							description:
								"This endpoint is used as the callback URL for SSO providers. It handles the authorization code and exchanges it for an access token",
							responses: {
								"302": {
									description: "Redirects to the callback URL",
								},
							},
						},
					},
				},
				async (ctx) => {
					const { code, state, error, error_description } = ctx.query;
					const stateData = await parseState(ctx);
					if (!stateData) {
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=invalid_state`,
						);
					}
					const { callbackURL, errorURL, newUserURL, requestSignUp } =
						stateData;
					if (!code || error) {
						throw ctx.redirect(
							`${
								errorURL || callbackURL
							}?error=${error}&error_description=${error_description}`,
						);
					}
					const provider = await ctx.context.adapter
						.findOne<{
							oidcConfig: string;
						}>({
							model: "ssoProvider",
							where: [
								{
									field: "providerId",
									value: ctx.params.providerId,
								},
							],
						})
						.then((res) => {
							if (!res) {
								return null;
							}
							return {
								...res,
								oidcConfig: JSON.parse(res.oidcConfig),
							} as SSOProvider;
						});
					if (!provider) {
						throw ctx.redirect(
							`${
								errorURL || callbackURL
							}/error?error=invalid_provider&error_description=provider not found`,
						);
					}
					let config = provider.oidcConfig;

					const discovery = await betterFetch<{
						token_endpoint: string;
						userinfo_endpoint: string;
						token_endpoint_auth_method:
							| "client_secret_basic"
							| "client_secret_post";
					}>(provider.oidcConfig.discoveryEndpoint);

					if (discovery.data) {
						config = {
							tokenEndpoint: discovery.data.token_endpoint,
							tokenEndpointAuthentication:
								discovery.data.token_endpoint_auth_method,
							userInfoEndpoint: discovery.data.userinfo_endpoint,
							scopes: ["openid", "email", "profile", "offline_access"],
							...provider.oidcConfig,
						};
					}

					if (!config.tokenEndpoint) {
						throw ctx.redirect(
							`${
								errorURL || callbackURL
							}/error?error=invalid_provider&error_description=token_endpoint_not_found`,
						);
					}

					const tokenResponse = await validateAuthorizationCode({
						code,
						codeVerifier: provider.oidcConfig.pkce
							? stateData.codeVerifier
							: undefined,
						redirectURI: `${ctx.context.baseURL}/sso/callback/${provider.providerId}`,
						options: {
							clientId: provider.oidcConfig.clientId,
							clientSecret: provider.oidcConfig.clientSecret,
						},
						tokenEndpoint: config.tokenEndpoint,
						authentication:
							config.tokenEndpointAuthentication === "client_secret_post"
								? "post"
								: "basic",
					}).catch((e) => {
						if (e instanceof BetterFetchError) {
							throw ctx.redirect(
								`${
									errorURL || callbackURL
								}?error=invalid_provider&error_description=${e.message}`,
							);
						}
						return null;
					});
					if (!tokenResponse) {
						throw ctx.redirect(
							`${
								errorURL || callbackURL
							}/error?error=invalid_provider&error_description=token_response_not_found`,
						);
					}
					let userInfo: {
						id?: string;
						email?: string;
						name?: string;
						image?: string;
						emailVerified?: boolean;
						[key: string]: any;
					} | null = null;
					if (tokenResponse.idToken) {
						const idToken = decodeJwt(tokenResponse.idToken);
						if (!config.jwksEndpoint) {
							throw ctx.redirect(
								`${
									errorURL || callbackURL
								}/error?error=invalid_provider&error_description=jwks_endpoint_not_found`,
							);
						}
						const verified = await validateToken(
							tokenResponse.idToken,
							config.jwksEndpoint,
						).catch((e) => {
							ctx.context.logger.error(e);
							return null;
						});
						if (!verified) {
							throw ctx.redirect(
								`${
									errorURL || callbackURL
								}/error?error=invalid_provider&error_description=token_not_verified`,
							);
						}
						if (verified.payload.iss !== provider.issuer) {
							throw ctx.redirect(
								`${
									errorURL || callbackURL
								}/error?error=invalid_provider&error_description=issuer_mismatch`,
							);
						}

						const mapping = config.mapping || {};
						userInfo = {
							...Object.fromEntries(
								Object.entries(mapping.extraFields || {}).map(
									([key, value]) => [key, verified.payload[value]],
								),
							),
							id: idToken[mapping.id || "sub"],
							email: idToken[mapping.email || "email"],
							emailVerified: idToken[mapping.emailVerified || "email_verified"],
							name: idToken[mapping.name || "name"],
							image: idToken[mapping.image || "picture"],
						} as {
							id?: string;
							email?: string;
							name?: string;
							image?: string;
							emailVerified?: boolean;
						};
					}

					if (!userInfo) {
						if (!config.userInfoEndpoint) {
							throw ctx.redirect(
								`${
									errorURL || callbackURL
								}/error?error=invalid_provider&error_description=user_info_endpoint_not_found`,
							);
						}
						const userInfoResponse = await betterFetch<{
							email?: string;
							name?: string;
							id?: string;
							image?: string;
							emailVerified?: boolean;
						}>(config.userInfoEndpoint, {
							headers: {
								Authorization: `Bearer ${tokenResponse.accessToken}`,
							},
						});
						if (userInfoResponse.error) {
							throw ctx.redirect(
								`${
									errorURL || callbackURL
								}/error?error=invalid_provider&error_description=${
									userInfoResponse.error.message
								}`,
							);
						}
						userInfo = userInfoResponse.data;
					}

					if (!userInfo.email || !userInfo.id) {
						throw ctx.redirect(
							`${
								errorURL || callbackURL
							}/error?error=invalid_provider&error_description=missing_user_info`,
						);
					}
					const linked = await handleOAuthUserInfo(ctx, {
						userInfo: {
							email: userInfo.email,
							name: userInfo.name || userInfo.email,
							id: userInfo.id,
							image: userInfo.image,
							emailVerified: userInfo.emailVerified || false,
						},
						account: {
							idToken: tokenResponse.idToken,
							accessToken: tokenResponse.accessToken,
							refreshToken: tokenResponse.refreshToken,
							accountId: userInfo.id,
							providerId: provider.providerId,
							accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
							refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
							scope: tokenResponse.scopes?.join(","),
						},
						callbackURL,
						disableSignUp: options?.disableImplicitSignUp && !requestSignUp,
						overrideUserInfo: config.overrideUserInfo,
					});
					if (linked.error) {
						throw ctx.redirect(
							`${errorURL || callbackURL}/error?error=${linked.error}`,
						);
					}
					const { session, user } = linked.data!;

					if (options?.provisionUser) {
						await options.provisionUser({
							user,
							userInfo,
							token: tokenResponse,
							provider,
						});
					}
					if (
						provider.organizationId &&
						!options?.organizationProvisioning?.disabled
					) {
						const isOrgPluginEnabled = ctx.context.options.plugins?.find(
							(plugin) => plugin.id === "organization",
						);
						if (isOrgPluginEnabled) {
							const isAlreadyMember = await ctx.context.adapter.findOne({
								model: "member",
								where: [
									{ field: "organizationId", value: provider.organizationId },
									{ field: "userId", value: user.id },
								],
							});
							if (!isAlreadyMember) {
								const role = options?.organizationProvisioning?.getRole
									? await options.organizationProvisioning.getRole({
											user,
											userInfo,
											token: tokenResponse,
											provider,
										})
									: options?.organizationProvisioning?.defaultRole || "member";
								await ctx.context.adapter.create({
									model: "member",
									data: {
										organizationId: provider.organizationId,
										userId: user.id,
										role,
										createdAt: new Date(),
										updatedAt: new Date(),
									},
								});
							}
						}
					}
					await setSessionCookie(ctx, {
						session,
						user,
					});
					let toRedirectTo: string;
					try {
						const url = linked.isRegister
							? newUserURL || callbackURL
							: callbackURL;
						toRedirectTo = url.toString();
					} catch {
						toRedirectTo = linked.isRegister
							? newUserURL || callbackURL
							: callbackURL;
					}
					throw ctx.redirect(toRedirectTo);
				},
			),
		},
		schema: {
			ssoProvider: {
				fields: {
					issuer: {
						type: "string",
						required: true,
					},
					oidcConfig: {
						type: "string",
						required: false,
					},
					samlConfig: {
						type: "string",
						required: false,
					},
					userId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
					},
					providerId: {
						type: "string",
						required: true,
						unique: true,
					},
					organizationId: {
						type: "string",
						required: false,
					},
					domain: {
						type: "string",
						required: true,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};

export interface SSOProvider {
	issuer: string;
	oidcConfig: OIDCConfig;
	userId: string;
	providerId: string;
	organizationId?: string;
}

export interface OIDCConfig {
	issuer: string;
	pkce: boolean;
	clientId: string;
	clientSecret: string;
	authorizationEndpoint?: string;
	discoveryEndpoint: string;
	userInfoEndpoint?: string;
	scopes?: string[];
	overrideUserInfo?: boolean;
	tokenEndpoint?: string;
	tokenEndpointAuthentication?: "client_secret_post" | "client_secret_basic";
	jwksEndpoint?: string;
	mapping?: {
		id?: string;
		email?: string;
		emailVerified?: string;
		name?: string;
		image?: string;
		extraFields?: Record<string, string>;
	};
}
