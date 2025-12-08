import { BetterFetchError, betterFetch } from "@better-fetch/fetch";
import type { Account, Session, User, Verification } from "better-auth";
import {
	createAuthorizationURL,
	generateState,
	parseState,
	validateAuthorizationCode,
	validateToken,
} from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { decodeJwt } from "jose";
import * as saml from "samlify";
import type { BindingContext } from "samlify/types/src/entity";
import type { IdentityProvider } from "samlify/types/src/entity-idp";
import type { FlowResult } from "samlify/types/src/flow";
import * as z from "zod/v4";
import type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider } from "../types";
import { safeJsonParse, validateEmailDomain } from "../utils";

const spMetadataQuerySchema = z.object({
	providerId: z.string(),
	format: z.enum(["xml", "json"]).default("xml"),
});

export const spMetadata = () => {
	return createAuthEndpoint(
		"/sso/saml2/sp/metadata",
		{
			method: "GET",
			query: spMetadataQuerySchema,
			metadata: {
				openapi: {
					operationId: "getSSOServiceProviderMetadata",
					summary: "Get Service Provider metadata",
					description: "Returns the SAML metadata for the Service Provider",
					responses: {
						"200": {
							description: "SAML metadata in XML format",
						},
					},
				},
			},
		},
		async (ctx) => {
			const provider = await ctx.context.adapter.findOne<{
				id: string;
				samlConfig: string;
			}>({
				model: "ssoProvider",
				where: [
					{
						field: "providerId",
						value: ctx.query.providerId,
					},
				],
			});
			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "No provider found for the given providerId",
				});
			}

			const parsedSamlConfig = safeJsonParse<SAMLConfig>(provider.samlConfig);
			if (!parsedSamlConfig) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML configuration",
				});
			}
			const sp = parsedSamlConfig.spMetadata.metadata
				? saml.ServiceProvider({
						metadata: parsedSamlConfig.spMetadata.metadata,
					})
				: saml.SPMetadata({
						entityID:
							parsedSamlConfig.spMetadata?.entityID || parsedSamlConfig.issuer,
						assertionConsumerService: [
							{
								Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
								Location:
									parsedSamlConfig.callbackUrl ||
									`${ctx.context.baseURL}/sso/saml2/sp/acs/${provider.id}`,
							},
						],
						wantMessageSigned: parsedSamlConfig.wantAssertionsSigned || false,
						nameIDFormat: parsedSamlConfig.identifierFormat
							? [parsedSamlConfig.identifierFormat]
							: undefined,
					});
			return new Response(sp.getMetadata(), {
				headers: {
					"Content-Type": "application/xml",
				},
			});
		},
	);
};

const ssoProviderBodySchema = z.object({
	providerId: z.string({}).meta({
		description:
			"The ID of the provider. This is used to identify the provider during login and callback",
	}),
	issuer: z.string({}).meta({
		description: "The issuer of the provider",
	}),
	domain: z.string({}).meta({
		description: "The domain of the provider. This is used for email matching",
	}),
	oidcConfig: z
		.object({
			clientId: z.string({}).meta({
				description: "The client ID",
			}),
			clientSecret: z.string({}).meta({
				description: "The client secret",
			}),
			authorizationEndpoint: z
				.string({})
				.meta({
					description: "The authorization endpoint",
				})
				.optional(),
			tokenEndpoint: z
				.string({})
				.meta({
					description: "The token endpoint",
				})
				.optional(),
			userInfoEndpoint: z
				.string({})
				.meta({
					description: "The user info endpoint",
				})
				.optional(),
			tokenEndpointAuthentication: z
				.enum(["client_secret_post", "client_secret_basic"])
				.optional(),
			jwksEndpoint: z
				.string({})
				.meta({
					description: "The JWKS endpoint",
				})
				.optional(),
			discoveryEndpoint: z.string().optional(),
			scopes: z
				.array(z.string(), {})
				.meta({
					description:
						"The scopes to request. Defaults to ['openid', 'email', 'profile', 'offline_access']",
				})
				.optional(),
			pkce: z
				.boolean({})
				.meta({
					description: "Whether to use PKCE for the authorization flow",
				})
				.default(true)
				.optional(),
			mapping: z
				.object({
					id: z.string({}).meta({
						description: "Field mapping for user ID (defaults to 'sub')",
					}),
					email: z.string({}).meta({
						description: "Field mapping for email (defaults to 'email')",
					}),
					emailVerified: z
						.string({})
						.meta({
							description:
								"Field mapping for email verification (defaults to 'email_verified')",
						})
						.optional(),
					name: z.string({}).meta({
						description: "Field mapping for name (defaults to 'name')",
					}),
					image: z
						.string({})
						.meta({
							description: "Field mapping for image (defaults to 'picture')",
						})
						.optional(),
					extraFields: z.record(z.string(), z.any()).optional(),
				})
				.optional(),
		})
		.optional(),
	samlConfig: z
		.object({
			entryPoint: z.string({}).meta({
				description: "The entry point of the provider",
			}),
			cert: z.string({}).meta({
				description: "The certificate of the provider",
			}),
			callbackUrl: z.string({}).meta({
				description: "The callback URL of the provider",
			}),
			audience: z.string().optional(),
			idpMetadata: z
				.object({
					metadata: z.string().optional(),
					entityID: z.string().optional(),
					cert: z.string().optional(),
					privateKey: z.string().optional(),
					privateKeyPass: z.string().optional(),
					isAssertionEncrypted: z.boolean().optional(),
					encPrivateKey: z.string().optional(),
					encPrivateKeyPass: z.string().optional(),
					singleSignOnService: z
						.array(
							z.object({
								Binding: z.string().meta({
									description: "The binding type for the SSO service",
								}),
								Location: z.string().meta({
									description: "The URL for the SSO service",
								}),
							}),
						)
						.optional()
						.meta({
							description: "Single Sign-On service configuration",
						}),
				})
				.optional(),
			spMetadata: z.object({
				metadata: z.string().optional(),
				entityID: z.string().optional(),
				binding: z.string().optional(),
				privateKey: z.string().optional(),
				privateKeyPass: z.string().optional(),
				isAssertionEncrypted: z.boolean().optional(),
				encPrivateKey: z.string().optional(),
				encPrivateKeyPass: z.string().optional(),
			}),
			wantAssertionsSigned: z.boolean().optional(),
			signatureAlgorithm: z.string().optional(),
			digestAlgorithm: z.string().optional(),
			identifierFormat: z.string().optional(),
			privateKey: z.string().optional(),
			decryptionPvk: z.string().optional(),
			additionalParams: z.record(z.string(), z.any()).optional(),
			mapping: z
				.object({
					id: z.string({}).meta({
						description: "Field mapping for user ID (defaults to 'nameID')",
					}),
					email: z.string({}).meta({
						description: "Field mapping for email (defaults to 'email')",
					}),
					emailVerified: z
						.string({})
						.meta({
							description: "Field mapping for email verification",
						})
						.optional(),
					name: z.string({}).meta({
						description: "Field mapping for name (defaults to 'displayName')",
					}),
					firstName: z
						.string({})
						.meta({
							description:
								"Field mapping for first name (defaults to 'givenName')",
						})
						.optional(),
					lastName: z
						.string({})
						.meta({
							description:
								"Field mapping for last name (defaults to 'surname')",
						})
						.optional(),
					extraFields: z.record(z.string(), z.any()).optional(),
				})
				.optional(),
		})
		.optional(),
	organizationId: z
		.string({})
		.meta({
			description:
				"If organization plugin is enabled, the organization id to link the provider to",
		})
		.optional(),
	overrideUserInfo: z
		.boolean({})
		.meta({
			description:
				"Override user info with the provider info. Defaults to false",
		})
		.default(false)
		.optional(),
});

export const registerSSOProvider = <O extends SSOOptions>(options: O) => {
	return createAuthEndpoint(
		"/sso/register",
		{
			method: "POST",
			body: ssoProviderBodySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					operationId: "registerSSOProvider",
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
											domainVerified: {
												type: "boolean",
												description:
													"A boolean indicating whether the domain has been verified or not",
											},
											domainVerificationToken: {
												type: "string",
												description:
													"Domain verification token. It can be used to prove ownership over the SSO domain",
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
														description: "The client secret for the provider",
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
														enum: ["client_secret_post", "client_secret_basic"],
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
												description: "ID of the linked organization, if any",
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
			const user = ctx.context.session?.user;
			if (!user) {
				throw new APIError("UNAUTHORIZED");
			}

			const limit =
				typeof options?.providersLimit === "function"
					? await options.providersLimit(user)
					: (options?.providersLimit ?? 10);

			if (!limit) {
				throw new APIError("FORBIDDEN", {
					message: "SSO provider registration is disabled",
				});
			}

			const providers = await ctx.context.adapter.findMany({
				model: "ssoProvider",
				where: [{ field: "userId", value: user.id }],
			});

			if (providers.length >= limit) {
				throw new APIError("FORBIDDEN", {
					message: "You have reached the maximum number of SSO providers",
				});
			}

			const body = ctx.body;
			const issuerValidator = z.string().url();
			if (issuerValidator.safeParse(body.issuer).error) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid issuer. Must be a valid URL",
				});
			}
			if (ctx.body.organizationId) {
				const organization = await ctx.context.adapter.findOne({
					model: "member",
					where: [
						{
							field: "userId",
							value: user.id,
						},
						{
							field: "organizationId",
							value: ctx.body.organizationId,
						},
					],
				});
				if (!organization) {
					throw new APIError("BAD_REQUEST", {
						message: "You are not a member of the organization",
					});
				}
			}

			const existingProvider = await ctx.context.adapter.findOne({
				model: "ssoProvider",
				where: [
					{
						field: "providerId",
						value: body.providerId,
					},
				],
			});

			if (existingProvider) {
				ctx.context.logger.info(
					`SSO provider creation attempt with existing providerId: ${body.providerId}`,
				);
				throw new APIError("UNPROCESSABLE_ENTITY", {
					message: "SSO provider with this providerId already exists",
				});
			}

			const provider = await ctx.context.adapter.create<
				Record<string, any>,
				SSOProvider<O>
			>({
				model: "ssoProvider",
				data: {
					issuer: body.issuer,
					domain: body.domain,
					domainVerified: false,
					oidcConfig: body.oidcConfig
						? JSON.stringify({
								issuer: body.issuer,
								clientId: body.oidcConfig.clientId,
								clientSecret: body.oidcConfig.clientSecret,
								authorizationEndpoint: body.oidcConfig.authorizationEndpoint,
								tokenEndpoint: body.oidcConfig.tokenEndpoint,
								tokenEndpointAuthentication:
									body.oidcConfig.tokenEndpointAuthentication,
								jwksEndpoint: body.oidcConfig.jwksEndpoint,
								pkce: body.oidcConfig.pkce,
								discoveryEndpoint:
									body.oidcConfig.discoveryEndpoint ||
									`${body.issuer}/.well-known/openid-configuration`,
								mapping: body.oidcConfig.mapping,
								scopes: body.oidcConfig.scopes,
								userInfoEndpoint: body.oidcConfig.userInfoEndpoint,
								overrideUserInfo:
									ctx.body.overrideUserInfo ||
									options?.defaultOverrideUserInfo ||
									false,
							})
						: null,
					samlConfig: body.samlConfig
						? JSON.stringify({
								issuer: body.issuer,
								entryPoint: body.samlConfig.entryPoint,
								cert: body.samlConfig.cert,
								callbackUrl: body.samlConfig.callbackUrl,
								audience: body.samlConfig.audience,
								idpMetadata: body.samlConfig.idpMetadata,
								spMetadata: body.samlConfig.spMetadata,
								wantAssertionsSigned: body.samlConfig.wantAssertionsSigned,
								signatureAlgorithm: body.samlConfig.signatureAlgorithm,
								digestAlgorithm: body.samlConfig.digestAlgorithm,
								identifierFormat: body.samlConfig.identifierFormat,
								privateKey: body.samlConfig.privateKey,
								decryptionPvk: body.samlConfig.decryptionPvk,
								additionalParams: body.samlConfig.additionalParams,
								mapping: body.samlConfig.mapping,
							})
						: null,
					organizationId: body.organizationId,
					userId: ctx.context.session.user.id,
					providerId: body.providerId,
				},
			});

			let domainVerificationToken: string | undefined;
			let domainVerified: boolean | undefined;

			if (options?.domainVerification?.enabled) {
				domainVerified = false;
				domainVerificationToken = generateRandomString(24);

				await ctx.context.adapter.create<Verification>({
					model: "verification",
					data: {
						identifier: options.domainVerification?.tokenPrefix
							? `${options.domainVerification?.tokenPrefix}-${provider.providerId}`
							: `better-auth-token-${provider.providerId}`,
						createdAt: new Date(),
						updatedAt: new Date(),
						value: domainVerificationToken,
						expiresAt: new Date(Date.now() + 3600 * 24 * 7 * 1000), // 1 week
					},
				});
			}

			type SSOProviderReturn = O["domainVerification"] extends { enabled: true }
				? {
						domainVerified: boolean;
						domainVerificationToken: string;
					} & SSOProvider<O>
				: SSOProvider<O>;

			return ctx.json({
				...provider,
				oidcConfig: safeJsonParse<OIDCConfig>(
					provider.oidcConfig as unknown as string,
				),
				samlConfig: safeJsonParse<SAMLConfig>(
					provider.samlConfig as unknown as string,
				),
				redirectURI: `${ctx.context.baseURL}/sso/callback/${provider.providerId}`,
				...(options?.domainVerification?.enabled ? { domainVerified } : {}),
				...(options?.domainVerification?.enabled
					? { domainVerificationToken }
					: {}),
			} as unknown as SSOProviderReturn);
		},
	);
};

const signInSSOBodySchema = z.object({
	email: z
		.string({})
		.meta({
			description:
				"The email address to sign in with. This is used to identify the issuer to sign in with. It's optional if the issuer is provided",
		})
		.optional(),
	organizationSlug: z
		.string({})
		.meta({
			description: "The slug of the organization to sign in with",
		})
		.optional(),
	providerId: z
		.string({})
		.meta({
			description:
				"The ID of the provider to sign in with. This can be provided instead of email or issuer",
		})
		.optional(),
	domain: z
		.string({})
		.meta({
			description: "The domain of the provider.",
		})
		.optional(),
	callbackURL: z.string({}).meta({
		description: "The URL to redirect to after login",
	}),
	errorCallbackURL: z
		.string({})
		.meta({
			description: "The URL to redirect to after login",
		})
		.optional(),
	newUserCallbackURL: z
		.string({})
		.meta({
			description: "The URL to redirect to after login if the user is new",
		})
		.optional(),
	scopes: z
		.array(z.string(), {})
		.meta({
			description: "Scopes to request from the provider.",
		})
		.optional(),
	loginHint: z
		.string({})
		.meta({
			description:
				"Login hint to send to the identity provider (e.g., email or identifier). If supported, will be sent as 'login_hint'.",
		})
		.optional(),
	requestSignUp: z
		.boolean({})
		.meta({
			description:
				"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider",
		})
		.optional(),
	providerType: z.enum(["oidc", "saml"]).optional(),
});

export const signInSSO = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sign-in/sso",
		{
			method: "POST",
			body: signInSSOBodySchema,
			metadata: {
				openapi: {
					operationId: "signInWithSSO",
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
										loginHint: {
											type: "string",
											description:
												"Login hint to send to the identity provider (e.g., email or identifier). If supported, sent as 'login_hint'.",
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
			if (
				!options?.defaultSSO?.length &&
				!email &&
				!organizationSlug &&
				!domain &&
				!providerId
			) {
				throw new APIError("BAD_REQUEST", {
					message: "email, organizationSlug, domain or providerId is required",
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
			let provider: SSOProvider<SSOOptions> | null = null;
			if (options?.defaultSSO?.length) {
				// Find matching default SSO provider by providerId
				const matchingDefault = providerId
					? options.defaultSSO.find(
							(defaultProvider) => defaultProvider.providerId === providerId,
						)
					: options.defaultSSO.find(
							(defaultProvider) => defaultProvider.domain === domain,
						);

				if (matchingDefault) {
					provider = {
						issuer:
							matchingDefault.samlConfig?.issuer ||
							matchingDefault.oidcConfig?.issuer ||
							"",
						providerId: matchingDefault.providerId,
						userId: "default",
						oidcConfig: matchingDefault.oidcConfig,
						samlConfig: matchingDefault.samlConfig,
						domain: matchingDefault.domain,
						...(options.domainVerification?.enabled
							? { domainVerified: true }
							: {}),
					} as SSOProvider<SSOOptions>;
				}
			}
			if (!providerId && !orgId && !domain) {
				throw new APIError("BAD_REQUEST", {
					message: "providerId, orgId or domain is required",
				});
			}
			// Try to find provider in database
			if (!provider) {
				provider = await ctx.context.adapter
					.findOne<SSOProvider<SSOOptions>>({
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
							oidcConfig: res.oidcConfig
								? safeJsonParse<OIDCConfig>(
										res.oidcConfig as unknown as string,
									) || undefined
								: undefined,
							samlConfig: res.samlConfig
								? safeJsonParse<SAMLConfig>(
										res.samlConfig as unknown as string,
									) || undefined
								: undefined,
						};
					});
			}

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "No provider found for the issuer",
				});
			}

			if (body.providerType) {
				if (body.providerType === "oidc" && !provider.oidcConfig) {
					throw new APIError("BAD_REQUEST", {
						message: "OIDC provider is not configured",
					});
				}
				if (body.providerType === "saml" && !provider.samlConfig) {
					throw new APIError("BAD_REQUEST", {
						message: "SAML provider is not configured",
					});
				}
			}

			if (
				options?.domainVerification?.enabled &&
				!("domainVerified" in provider && provider.domainVerified)
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Provider domain has not been verified",
				});
			}

			if (provider.oidcConfig && body.providerType !== "saml") {
				let finalAuthUrl = provider.oidcConfig.authorizationEndpoint;
				if (!finalAuthUrl && provider.oidcConfig.discoveryEndpoint) {
					const discovery = await betterFetch<{
						authorization_endpoint: string;
					}>(provider.oidcConfig.discoveryEndpoint, {
						method: "GET",
					});
					if (discovery.data) {
						finalAuthUrl = discovery.data.authorization_endpoint;
					}
				}
				if (!finalAuthUrl) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid OIDC configuration. Authorization URL not found.",
					});
				}
				const state = await generateState(ctx, undefined, false);
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
					scopes: ctx.body.scopes ||
						provider.oidcConfig.scopes || [
							"openid",
							"email",
							"profile",
							"offline_access",
						],
					loginHint: ctx.body.loginHint || email,
					authorizationEndpoint: finalAuthUrl,
				});
				return ctx.json({
					url: authorizationURL.toString(),
					redirect: true,
				});
			}
			if (provider.samlConfig) {
				const parsedSamlConfig =
					typeof provider.samlConfig === "object"
						? provider.samlConfig
						: safeJsonParse<SAMLConfig>(
								provider.samlConfig as unknown as string,
							);
				if (!parsedSamlConfig) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid SAML configuration",
					});
				}

				let metadata = parsedSamlConfig.spMetadata.metadata;

				if (!metadata) {
					metadata =
						saml
							.SPMetadata({
								entityID:
									parsedSamlConfig.spMetadata?.entityID ||
									parsedSamlConfig.issuer,
								assertionConsumerService: [
									{
										Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
										Location:
											parsedSamlConfig.callbackUrl ||
											`${ctx.context.baseURL}/sso/saml2/sp/acs/${provider.providerId}`,
									},
								],
								wantMessageSigned:
									parsedSamlConfig.wantAssertionsSigned || false,
								nameIDFormat: parsedSamlConfig.identifierFormat
									? [parsedSamlConfig.identifierFormat]
									: undefined,
							})
							.getMetadata() || "";
				}

				const sp = saml.ServiceProvider({
					metadata: metadata,
					allowCreate: true,
				});

				const idp = saml.IdentityProvider({
					metadata: parsedSamlConfig.idpMetadata?.metadata,
					entityID: parsedSamlConfig.idpMetadata?.entityID,
					encryptCert: parsedSamlConfig.idpMetadata?.cert,
					singleSignOnService:
						parsedSamlConfig.idpMetadata?.singleSignOnService,
				});
				const loginRequest = sp.createLoginRequest(
					idp,
					"redirect",
				) as BindingContext & { entityEndpoint: string; type: string };
				if (!loginRequest) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid SAML request",
					});
				}
				return ctx.json({
					url: `${loginRequest.context}&RelayState=${encodeURIComponent(
						body.callbackURL,
					)}`,
					redirect: true,
				});
			}
			throw new APIError("BAD_REQUEST", {
				message: "Invalid SSO provider",
			});
		},
	);
};

const callbackSSOQuerySchema = z.object({
	code: z.string().optional(),
	state: z.string(),
	error: z.string().optional(),
	error_description: z.string().optional(),
});

export const callbackSSO = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/callback/:providerId",
		{
			method: "GET",
			query: callbackSSOQuerySchema,
			allowedMediaTypes: [
				"application/x-www-form-urlencoded",
				"application/json",
			],
			metadata: {
				isAction: false,
				openapi: {
					operationId: "handleSSOCallback",
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
				const errorURL =
					ctx.context.options.onAPIError?.errorURL ||
					`${ctx.context.baseURL}/error`;
				throw ctx.redirect(`${errorURL}?error=invalid_state`);
			}
			const { callbackURL, errorURL, newUserURL, requestSignUp } = stateData;
			if (!code || error) {
				throw ctx.redirect(
					`${
						errorURL || callbackURL
					}?error=${error}&error_description=${error_description}`,
				);
			}
			let provider: SSOProvider<SSOOptions> | null = null;
			if (options?.defaultSSO?.length) {
				const matchingDefault = options.defaultSSO.find(
					(defaultProvider) =>
						defaultProvider.providerId === ctx.params.providerId,
				);
				if (matchingDefault) {
					provider = {
						...matchingDefault,
						issuer: matchingDefault.oidcConfig?.issuer || "",
						userId: "default",
						...(options.domainVerification?.enabled
							? { domainVerified: true }
							: {}),
					} as SSOProvider<SSOOptions>;
				}
			}
			if (!provider) {
				provider = await ctx.context.adapter
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
							oidcConfig:
								safeJsonParse<OIDCConfig>(res.oidcConfig) || undefined,
						} as SSOProvider<SSOOptions>;
					});
			}
			if (!provider) {
				throw ctx.redirect(
					`${
						errorURL || callbackURL
					}/error?error=invalid_provider&error_description=provider not found`,
				);
			}

			if (
				options?.domainVerification?.enabled &&
				!("domainVerified" in provider && provider.domainVerified)
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Provider domain has not been verified",
				});
			}

			let config = provider.oidcConfig;

			if (!config) {
				throw ctx.redirect(
					`${
						errorURL || callbackURL
					}/error?error=invalid_provider&error_description=provider not found`,
				);
			}

			const discovery = await betterFetch<{
				token_endpoint: string;
				userinfo_endpoint: string;
				token_endpoint_auth_method:
					| "client_secret_basic"
					| "client_secret_post";
			}>(config.discoveryEndpoint);

			if (discovery.data) {
				config = {
					tokenEndpoint: discovery.data.token_endpoint,
					tokenEndpointAuthentication:
						discovery.data.token_endpoint_auth_method,
					userInfoEndpoint: discovery.data.userinfo_endpoint,
					scopes: ["openid", "email", "profile", "offline_access"],
					...config,
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
				codeVerifier: config.pkce ? stateData.codeVerifier : undefined,
				redirectURI: `${ctx.context.baseURL}/sso/callback/${provider.providerId}`,
				options: {
					clientId: config.clientId,
					clientSecret: config.clientSecret,
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
						Object.entries(mapping.extraFields || {}).map(([key, value]) => [
							key,
							verified.payload[value],
						]),
					),
					id: idToken[mapping.id || "sub"],
					email: idToken[mapping.email || "email"],
					emailVerified: options?.trustEmailVerified
						? idToken[mapping.emailVerified || "email_verified"]
						: false,
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
					emailVerified: options?.trustEmailVerified
						? userInfo.emailVerified || false
						: false,
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
				const url = linked.isRegister ? newUserURL || callbackURL : callbackURL;
				toRedirectTo = url.toString();
			} catch {
				toRedirectTo = linked.isRegister
					? newUserURL || callbackURL
					: callbackURL;
			}
			throw ctx.redirect(toRedirectTo);
		},
	);
};

const callbackSSOSAMLBodySchema = z.object({
	SAMLResponse: z.string(),
	RelayState: z.string().optional(),
});

export const callbackSSOSAML = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/saml2/callback/:providerId",
		{
			method: "POST",
			body: callbackSSOSAMLBodySchema,
			metadata: {
				isAction: false,
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					operationId: "handleSAMLCallback",
					summary: "Callback URL for SAML provider",
					description:
						"This endpoint is used as the callback URL for SAML providers.",
					responses: {
						"302": {
							description: "Redirects to the callback URL",
						},
						"400": {
							description: "Invalid SAML response",
						},
						"401": {
							description: "Unauthorized - SAML authentication failed",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { SAMLResponse, RelayState } = ctx.body;
			const { providerId } = ctx.params;
			let provider: SSOProvider<SSOOptions> | null = null;
			if (options?.defaultSSO?.length) {
				const matchingDefault = options.defaultSSO.find(
					(defaultProvider) => defaultProvider.providerId === providerId,
				);
				if (matchingDefault) {
					provider = {
						...matchingDefault,
						userId: "default",
						issuer: matchingDefault.samlConfig?.issuer || "",
						...(options.domainVerification?.enabled
							? { domainVerified: true }
							: {}),
					} as SSOProvider<SSOOptions>;
				}
			}
			if (!provider) {
				provider = await ctx.context.adapter
					.findOne<SSOProvider<SSOOptions>>({
						model: "ssoProvider",
						where: [{ field: "providerId", value: providerId }],
					})
					.then((res) => {
						if (!res) return null;
						return {
							...res,
							samlConfig: res.samlConfig
								? safeJsonParse<SAMLConfig>(
										res.samlConfig as unknown as string,
									) || undefined
								: undefined,
						};
					});
			}

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "No provider found for the given providerId",
				});
			}

			if (
				options?.domainVerification?.enabled &&
				!("domainVerified" in provider && provider.domainVerified)
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Provider domain has not been verified",
				});
			}

			const parsedSamlConfig = safeJsonParse<SAMLConfig>(
				provider.samlConfig as unknown as string,
			);
			if (!parsedSamlConfig) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML configuration",
				});
			}
			const idpData = parsedSamlConfig.idpMetadata;
			let idp: IdentityProvider | null = null;

			// Construct IDP with fallback to manual configuration
			if (!idpData?.metadata) {
				idp = saml.IdentityProvider({
					entityID: idpData?.entityID || parsedSamlConfig.issuer,
					singleSignOnService: [
						{
							Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
							Location: parsedSamlConfig.entryPoint,
						},
					],
					signingCert: idpData?.cert || parsedSamlConfig.cert,
					wantAuthnRequestsSigned:
						parsedSamlConfig.wantAssertionsSigned || false,
					isAssertionEncrypted: idpData?.isAssertionEncrypted || false,
					encPrivateKey: idpData?.encPrivateKey,
					encPrivateKeyPass: idpData?.encPrivateKeyPass,
				});
			} else {
				idp = saml.IdentityProvider({
					metadata: idpData.metadata,
					privateKey: idpData.privateKey,
					privateKeyPass: idpData.privateKeyPass,
					isAssertionEncrypted: idpData.isAssertionEncrypted,
					encPrivateKey: idpData.encPrivateKey,
					encPrivateKeyPass: idpData.encPrivateKeyPass,
				});
			}

			// Construct SP with fallback to manual configuration
			const spData = parsedSamlConfig.spMetadata;
			const sp = saml.ServiceProvider({
				metadata: spData?.metadata,
				entityID: spData?.entityID || parsedSamlConfig.issuer,
				assertionConsumerService: spData?.metadata
					? undefined
					: [
							{
								Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
								Location: parsedSamlConfig.callbackUrl,
							},
						],
				privateKey: spData?.privateKey || parsedSamlConfig.privateKey,
				privateKeyPass: spData?.privateKeyPass,
				isAssertionEncrypted: spData?.isAssertionEncrypted || false,
				encPrivateKey: spData?.encPrivateKey,
				encPrivateKeyPass: spData?.encPrivateKeyPass,
				wantMessageSigned: parsedSamlConfig.wantAssertionsSigned || false,
				nameIDFormat: parsedSamlConfig.identifierFormat
					? [parsedSamlConfig.identifierFormat]
					: undefined,
			});

			let parsedResponse: FlowResult;
			try {
				const decodedResponse = Buffer.from(SAMLResponse, "base64").toString(
					"utf-8",
				);

				try {
					parsedResponse = await sp.parseLoginResponse(idp, "post", {
						body: {
							SAMLResponse,
							RelayState: RelayState || undefined,
						},
					});
				} catch (parseError) {
					const nameIDMatch = decodedResponse.match(
						/<saml2:NameID[^>]*>([^<]+)<\/saml2:NameID>/,
					);
					if (!nameIDMatch) throw parseError;
					parsedResponse = {
						extract: {
							nameID: nameIDMatch[1],
							attributes: { nameID: nameIDMatch[1] },
							sessionIndex: {},
							conditions: {},
						},
					} as FlowResult;
				}

				if (!parsedResponse?.extract) {
					throw new Error("Invalid SAML response structure");
				}
			} catch (error) {
				ctx.context.logger.error("SAML response validation failed", {
					error,
					decodedResponse: Buffer.from(SAMLResponse, "base64").toString(
						"utf-8",
					),
				});
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML response",
					details: error instanceof Error ? error.message : String(error),
				});
			}

			const { extract } = parsedResponse!;
			const attributes = extract.attributes || {};
			const mapping = parsedSamlConfig.mapping ?? {};

			const userInfo = {
				...Object.fromEntries(
					Object.entries(mapping.extraFields || {}).map(([key, value]) => [
						key,
						attributes[value as string],
					]),
				),
				id: attributes[mapping.id || "nameID"] || extract.nameID,
				email: attributes[mapping.email || "email"] || extract.nameID,
				name:
					[
						attributes[mapping.firstName || "givenName"],
						attributes[mapping.lastName || "surname"],
					]
						.filter(Boolean)
						.join(" ") ||
					attributes[mapping.name || "displayName"] ||
					extract.nameID,
				emailVerified:
					options?.trustEmailVerified && mapping.emailVerified
						? ((attributes[mapping.emailVerified] || false) as boolean)
						: false,
			};
			if (!userInfo.id || !userInfo.email) {
				ctx.context.logger.error(
					"Missing essential user info from SAML response",
					{
						attributes: Object.keys(attributes),
						mapping,
						extractedId: userInfo.id,
						extractedEmail: userInfo.email,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: "Unable to extract user ID or email from SAML response",
				});
			}

			// Find or create user
			let user: User;
			const existingUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: userInfo.email,
					},
				],
			});

			if (existingUser) {
				const account = await ctx.context.adapter.findOne<Account>({
					model: "account",
					where: [
						{ field: "userId", value: existingUser.id },
						{ field: "providerId", value: provider.providerId },
						{ field: "accountId", value: userInfo.id },
					],
				});
				if (!account) {
					const isTrustedProvider =
						ctx.context.options.account?.accountLinking?.trustedProviders?.includes(
							provider.providerId,
						) ||
						("domainVerified" in provider &&
							provider.domainVerified &&
							validateEmailDomain(userInfo.email, provider.domain));
					if (!isTrustedProvider) {
						const redirectUrl =
							RelayState || parsedSamlConfig.callbackUrl || ctx.context.baseURL;
						throw ctx.redirect(`${redirectUrl}?error=account_not_linked`);
					}
					await ctx.context.internalAdapter.createAccount({
						userId: existingUser.id,
						providerId: provider.providerId,
						accountId: userInfo.id,
						accessToken: "",
						refreshToken: "",
					});
				}
				user = existingUser;
			} else {
				// if implicit sign up is disabled, we should not create a new user nor a new account.
				if (options?.disableImplicitSignUp) {
					throw new APIError("UNAUTHORIZED", {
						message:
							"User not found and implicit sign up is disabled for this provider",
					});
				}

				user = await ctx.context.internalAdapter.createUser({
					email: userInfo.email,
					name: userInfo.name,
					emailVerified: userInfo.emailVerified,
				});
				await ctx.context.internalAdapter.createAccount({
					userId: user.id,
					providerId: provider.providerId,
					accountId: userInfo.id,
					accessToken: "",
					refreshToken: "",
				});
			}

			// Run provision hooks
			if (options?.provisionUser) {
				await options.provisionUser({
					user: user as User & Record<string, any>,
					userInfo,
					provider,
				});
			}

			// Handle organization provisioning
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

			// Create session and set cookie
			let session: Session = await ctx.context.internalAdapter.createSession(
				user.id,
			);
			await setSessionCookie(ctx, { session, user });

			// Redirect to callback URL
			const callbackUrl =
				RelayState || parsedSamlConfig.callbackUrl || ctx.context.baseURL;
			throw ctx.redirect(callbackUrl);
		},
	);
};

const acsEndpointParamsSchema = z.object({
	providerId: z.string().optional(),
});

const acsEndpointBodySchema = z.object({
	SAMLResponse: z.string(),
	RelayState: z.string().optional(),
});

export const acsEndpoint = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/saml2/sp/acs/:providerId",
		{
			method: "POST",
			params: acsEndpointParamsSchema,
			body: acsEndpointBodySchema,
			metadata: {
				isAction: false,
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					operationId: "handleSAMLAssertionConsumerService",
					summary: "SAML Assertion Consumer Service",
					description:
						"Handles SAML responses from IdP after successful authentication",
					responses: {
						"302": {
							description:
								"Redirects to the callback URL after successful authentication",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { SAMLResponse, RelayState = "" } = ctx.body;
			const { providerId } = ctx.params;

			// If defaultSSO is configured, use it as the provider
			let provider: SSOProvider<SSOOptions> | null = null;

			if (options?.defaultSSO?.length) {
				// For ACS endpoint, we can use the first default provider or try to match by providerId
				const matchingDefault = providerId
					? options.defaultSSO.find(
							(defaultProvider) => defaultProvider.providerId === providerId,
						)
					: options.defaultSSO[0]; // Use first default provider if no specific providerId

				if (matchingDefault) {
					provider = {
						issuer: matchingDefault.samlConfig?.issuer || "",
						providerId: matchingDefault.providerId,
						userId: "default",
						samlConfig: matchingDefault.samlConfig,
						domain: matchingDefault.domain,
						...(options.domainVerification?.enabled
							? { domainVerified: true }
							: {}),
					};
				}
			} else {
				provider = await ctx.context.adapter
					.findOne<SSOProvider<SSOOptions>>({
						model: "ssoProvider",
						where: [
							{
								field: "providerId",
								value: providerId ?? "sso",
							},
						],
					})
					.then((res) => {
						if (!res) return null;
						return {
							...res,
							samlConfig: res.samlConfig
								? safeJsonParse<SAMLConfig>(
										res.samlConfig as unknown as string,
									) || undefined
								: undefined,
						};
					});
			}

			if (!provider?.samlConfig) {
				throw new APIError("NOT_FOUND", {
					message: "No SAML provider found",
				});
			}

			if (
				options?.domainVerification?.enabled &&
				!("domainVerified" in provider && provider.domainVerified)
			) {
				throw new APIError("UNAUTHORIZED", {
					message: "Provider domain has not been verified",
				});
			}

			const parsedSamlConfig = provider.samlConfig;
			// Configure SP and IdP
			const sp = saml.ServiceProvider({
				entityID:
					parsedSamlConfig.spMetadata?.entityID || parsedSamlConfig.issuer,
				assertionConsumerService: [
					{
						Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
						Location:
							parsedSamlConfig.callbackUrl ||
							`${ctx.context.baseURL}/sso/saml2/sp/acs/${providerId}`,
					},
				],
				wantMessageSigned: parsedSamlConfig.wantAssertionsSigned || false,
				metadata: parsedSamlConfig.spMetadata?.metadata,
				privateKey:
					parsedSamlConfig.spMetadata?.privateKey ||
					parsedSamlConfig.privateKey,
				privateKeyPass: parsedSamlConfig.spMetadata?.privateKeyPass,
				nameIDFormat: parsedSamlConfig.identifierFormat
					? [parsedSamlConfig.identifierFormat]
					: undefined,
			});

			// Update where we construct the IdP
			const idpData = parsedSamlConfig.idpMetadata;
			const idp = !idpData?.metadata
				? saml.IdentityProvider({
						entityID: idpData?.entityID || parsedSamlConfig.issuer,
						singleSignOnService: idpData?.singleSignOnService || [
							{
								Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
								Location: parsedSamlConfig.entryPoint,
							},
						],
						signingCert: idpData?.cert || parsedSamlConfig.cert,
					})
				: saml.IdentityProvider({
						metadata: idpData.metadata,
					});

			// Parse and validate SAML response
			let parsedResponse: FlowResult;
			try {
				let decodedResponse = Buffer.from(SAMLResponse, "base64").toString(
					"utf-8",
				);

				// Patch the SAML response if status is missing or not success
				if (!decodedResponse.includes("StatusCode")) {
					// Insert a success status if missing
					const insertPoint = decodedResponse.indexOf("</saml2:Issuer>");
					if (insertPoint !== -1) {
						decodedResponse =
							decodedResponse.slice(0, insertPoint + 14) +
							'<saml2:Status><saml2:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></saml2:Status>' +
							decodedResponse.slice(insertPoint + 14);
					}
				} else if (!decodedResponse.includes("saml2:Success")) {
					// Replace existing non-success status with success
					decodedResponse = decodedResponse.replace(
						/<saml2:StatusCode Value="[^"]+"/,
						'<saml2:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"',
					);
				}

				try {
					parsedResponse = await sp.parseLoginResponse(idp, "post", {
						body: {
							SAMLResponse,
							RelayState: RelayState || undefined,
						},
					});
				} catch (parseError) {
					const nameIDMatch = decodedResponse.match(
						/<saml2:NameID[^>]*>([^<]+)<\/saml2:NameID>/,
					);
					// due to different spec. we have to make sure to handle that.
					if (!nameIDMatch) throw parseError;
					parsedResponse = {
						extract: {
							nameID: nameIDMatch[1],
							attributes: { nameID: nameIDMatch[1] },
							sessionIndex: {},
							conditions: {},
						},
					} as FlowResult;
				}

				if (!parsedResponse?.extract) {
					throw new Error("Invalid SAML response structure");
				}
			} catch (error) {
				ctx.context.logger.error("SAML response validation failed", {
					error,
					decodedResponse: Buffer.from(SAMLResponse, "base64").toString(
						"utf-8",
					),
				});
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML response",
					details: error instanceof Error ? error.message : String(error),
				});
			}

			const { extract } = parsedResponse!;
			const attributes = extract.attributes || {};
			const mapping = parsedSamlConfig.mapping ?? {};

			const userInfo = {
				...Object.fromEntries(
					Object.entries(mapping.extraFields || {}).map(([key, value]) => [
						key,
						attributes[value as string],
					]),
				),
				id: attributes[mapping.id || "nameID"] || extract.nameID,
				email: attributes[mapping.email || "email"] || extract.nameID,
				name:
					[
						attributes[mapping.firstName || "givenName"],
						attributes[mapping.lastName || "surname"],
					]
						.filter(Boolean)
						.join(" ") ||
					attributes[mapping.name || "displayName"] ||
					extract.nameID,
				emailVerified:
					options?.trustEmailVerified && mapping.emailVerified
						? ((attributes[mapping.emailVerified] || false) as boolean)
						: false,
			};

			if (!userInfo.id || !userInfo.email) {
				ctx.context.logger.error(
					"Missing essential user info from SAML response",
					{
						attributes: Object.keys(attributes),
						mapping,
						extractedId: userInfo.id,
						extractedEmail: userInfo.email,
					},
				);
				throw new APIError("BAD_REQUEST", {
					message: "Unable to extract user ID or email from SAML response",
				});
			}

			// Find or create user
			let user: User;
			const existingUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: userInfo.email,
					},
				],
			});

			if (existingUser) {
				const account = await ctx.context.adapter.findOne<Account>({
					model: "account",
					where: [
						{ field: "userId", value: existingUser.id },
						{ field: "providerId", value: provider.providerId },
						{ field: "accountId", value: userInfo.id },
					],
				});
				if (!account) {
					const isTrustedProvider =
						ctx.context.options.account?.accountLinking?.trustedProviders?.includes(
							provider.providerId,
						) ||
						("domainVerified" in provider &&
							provider.domainVerified &&
							validateEmailDomain(userInfo.email, provider.domain));
					if (!isTrustedProvider) {
						throw ctx.redirect(
							`${parsedSamlConfig.callbackUrl}?error=account_not_found`,
						);
					}
					await ctx.context.internalAdapter.createAccount({
						userId: existingUser.id,
						providerId: provider.providerId,
						accountId: userInfo.id,
						accessToken: "",
						refreshToken: "",
					});
				}
				user = existingUser;
			} else {
				user = await ctx.context.internalAdapter.createUser({
					email: userInfo.email,
					name: userInfo.name,
					emailVerified: options?.trustEmailVerified
						? userInfo.emailVerified || false
						: false,
				});
				await ctx.context.internalAdapter.createAccount({
					userId: user.id,
					providerId: provider.providerId,
					accountId: userInfo.id,
					accessToken: "",
					refreshToken: "",
					accessTokenExpiresAt: new Date(),
					refreshTokenExpiresAt: new Date(),
					scope: "",
				});
			}

			if (options?.provisionUser) {
				await options.provisionUser({
					user: user as User & Record<string, any>,
					userInfo,
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

			let session: Session = await ctx.context.internalAdapter.createSession(
				user.id,
			);
			await setSessionCookie(ctx, { session, user });

			const callbackUrl =
				RelayState || parsedSamlConfig.callbackUrl || ctx.context.baseURL;
			throw ctx.redirect(callbackUrl);
		},
	);
};
