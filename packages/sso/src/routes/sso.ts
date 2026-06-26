import { runWithTransaction } from "@better-auth/core/context";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
import type {
	PrivateKeyJwtSigningAlgorithm,
	TokenEndpointAuth,
} from "better-auth";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	createPrivateKeyJwtClientAssertionGetter,
	generateState,
	getOAuth2Tokens,
	HIDE_METADATA,
	PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
	parseState,
} from "better-auth";
import {
	APIError,
	addOAuthServerContext,
	createAuthEndpoint,
	getSessionFromCtx,
	sessionMiddleware,
} from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import {
	additionalAuthorizationParamsSchema,
	handleOAuthUserInfo,
} from "better-auth/oauth2";
import { decodeJwt } from "jose";
import type { BindingContext } from "samlify/types/src/entity";
import type { RequestInfo } from "samlify/types/src/types";
import * as z from "zod";
import * as constants from "../constants";
import { assignOrganizationFromProvider } from "../linking";
import type { HydratedOIDCConfig } from "../oidc";
import {
	DiscoveryError,
	discoverOIDCConfig,
	ensureRuntimeDiscovery,
	fetchOIDCEndpoint,
	mapDiscoveryErrorToAPIError,
	validateOIDCEndpointUrls,
	validateOIDCIdToken,
} from "../oidc";
import { validateCertSources, validateConfigAlgorithms } from "../saml";
import { SAML_ERROR_CODES } from "../saml/error-codes";
import { generateRelayState } from "../saml-state";
import type {
	AuthnRequestRecord,
	InferSSOProvider,
	Member,
	OIDCConfig,
	SAMLConfig,
	SAMLSessionRecord,
	SSOOptions,
	SSOProvider,
	SSOProviderAdditionalFieldsInput,
} from "../types";
import {
	domainMatches,
	parseProviderEmailVerified,
	safeJsonParse,
	validateEmailDomain,
} from "../utils";
import { getVerificationIdentifier } from "./domain-verification";
import {
	createIdP,
	createSAMLPostForm,
	createSP,
	findSAMLProvider,
} from "./helpers";
import {
	filterSSOProviderAdditionalFields,
	hasOrgAdminRole,
	lockSSOProviderForAccountLink,
} from "./providers";
import { getSafeRedirectUrl, processSAMLResponse } from "./saml-pipeline";
import {
	getRegisterSSOProviderBodySchema,
	parseSSOProviderAdditionalFields,
} from "./schemas";

const BUILT_IN_ACCOUNT_PROVIDER_IDS = [
	"credential",
	"email-otp",
	"magic-link",
	"phone-number",
	"anonymous",
	"siwe",
] as const;

/**
 * Builds the OIDC redirect URI. Uses the shared `redirectURI` option
 * when set, otherwise falls back to `/sso/callback/:providerId`.
 */
function getOIDCRedirectURI(
	baseURL: string,
	providerId: string,
	options?: SSOOptions,
): string {
	if (options?.redirectURI?.trim()) {
		try {
			// Full URL — use as-is
			new URL(options.redirectURI);
			return options.redirectURI;
		} catch {
			// Relative path — append to baseURL
			const path = options.redirectURI.startsWith("/")
				? options.redirectURI
				: `/${options.redirectURI}`;
			return `${baseURL}${path}`;
		}
	}
	return `${baseURL}/sso/callback/${providerId}`;
}

const spMetadataQuerySchema = z.object({
	providerId: z.string(),
});

export const spMetadata = (options?: SSOOptions) => {
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
			const provider = await findSAMLProvider(
				ctx.query.providerId,
				options,
				ctx.context.adapter,
			);
			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: "No provider found for the given providerId",
				});
			}

			const parsedSamlConfig = provider.samlConfig;
			if (!parsedSamlConfig) {
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML configuration",
				});
			}

			const sp = createSP(
				parsedSamlConfig,
				ctx.context.baseURL,
				ctx.query.providerId,
				options?.saml?.enableSingleLogout
					? {
							sloOptions: {
								wantLogoutRequestSigned: options?.saml?.wantLogoutRequestSigned,
								wantLogoutResponseSigned:
									options?.saml?.wantLogoutResponseSigned,
							},
						}
					: undefined,
			);
			return new Response(sp.getMetadata(), {
				headers: {
					"Content-Type": "application/xml",
				},
			});
		},
	);
};

export const registerSSOProvider = <O extends SSOOptions>(options: O) => {
	const registerBodySchema = getRegisterSSOProviderBodySchema(options);
	type Body = z.infer<typeof registerBodySchema> &
		SSOProviderAdditionalFieldsInput<O>;

	return createAuthEndpoint(
		"/sso/register",
		{
			method: "POST",
			body: registerBodySchema,
			use: [sessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
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
			const additionalFields = parseSSOProviderAdditionalFields(
				options,
				body,
				"create",
			);

			if (body.samlConfig?.idpMetadata?.metadata) {
				const maxMetadataSize =
					options?.saml?.maxMetadataSize ??
					constants.DEFAULT_MAX_SAML_METADATA_SIZE;
				if (
					new TextEncoder().encode(body.samlConfig.idpMetadata.metadata)
						.length > maxMetadataSize
				) {
					throw new APIError("BAD_REQUEST", {
						message: `IdP metadata exceeds maximum allowed size (${maxMetadataSize} bytes)`,
					});
				}
			}

			if (ctx.body.organizationId) {
				const member = await ctx.context.adapter.findOne<Member>({
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
				if (!member) {
					throw new APIError("BAD_REQUEST", {
						message: "You are not a member of the organization",
					});
				}
				if (ctx.context.hasPlugin("organization") && !hasOrgAdminRole(member)) {
					throw new APIError("FORBIDDEN", {
						message:
							"You must be an organization owner or admin to register SSO providers",
					});
				}
			}

			// SSO provider ids currently share the account-linking provider namespace.
			// Reject collisions so a user-registered SSO provider cannot be confused
			// with another account-producing provider.
			// TODO(next): replace providerId account-link ownership with immutable
			// SSO provider instance ids, then remove this cross-plugin slug coupling.
			// Trust for SSO providers is established separately via
			// verified domain ownership, never by this shared namespace.
			const reservedProviderIds = new Set<string>([
				...BUILT_IN_ACCOUNT_PROVIDER_IDS,
				...Object.keys(ctx.context.options.socialProviders ?? {}),
				...ctx.context.socialProviders.map((p) => p.id),
				...ctx.context.trustedProviders,
				...(options?.defaultSSO?.map((p) => p.providerId) ?? []),
			]);
			if (reservedProviderIds.has(body.providerId)) {
				ctx.context.logger.warn(
					`SSO provider registration rejected for reserved providerId: ${body.providerId}`,
				);
				throw new APIError("UNPROCESSABLE_ENTITY", {
					message:
						"This providerId is reserved and cannot be used for an SSO provider",
				});
			}

			if (ctx.context.hasPlugin("scim")) {
				const existingSCIMProvider = await ctx.context.adapter.findOne<{
					id: string;
				}>({
					model: "scimProvider",
					where: [{ field: "providerId", value: body.providerId }],
				});
				if (existingSCIMProvider) {
					ctx.context.logger.warn(
						`SSO provider registration rejected for SCIM providerId: ${body.providerId}`,
					);
					throw new APIError("UNPROCESSABLE_ENTITY", {
						message:
							"This providerId is already used by a SCIM provider and cannot be used for an SSO provider",
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

			if (body.oidcConfig) {
				try {
					validateOIDCEndpointUrls(body.oidcConfig, (url) =>
						ctx.context.isTrustedOrigin(url),
					);
				} catch (error) {
					if (error instanceof DiscoveryError) {
						throw mapDiscoveryErrorToAPIError(error);
					}
					throw error;
				}
			}

			let hydratedOIDCConfig: HydratedOIDCConfig | null = null;
			if (body.oidcConfig && !body.oidcConfig.skipDiscovery) {
				try {
					hydratedOIDCConfig = await discoverOIDCConfig({
						issuer: body.issuer,
						existingConfig: {
							discoveryEndpoint: body.oidcConfig.discoveryEndpoint,
							authorizationEndpoint: body.oidcConfig.authorizationEndpoint,
							tokenEndpoint: body.oidcConfig.tokenEndpoint,
							jwksEndpoint: body.oidcConfig.jwksEndpoint,
							userInfoEndpoint: body.oidcConfig.userInfoEndpoint,
							tokenEndpointAuthentication:
								body.oidcConfig.tokenEndpointAuthentication,
						},
						isTrustedOrigin: (url: string) => ctx.context.isTrustedOrigin(url),
					});
				} catch (error) {
					if (error instanceof DiscoveryError) {
						throw mapDiscoveryErrorToAPIError(error);
					}
					throw error;
				}
			}

			const buildOIDCConfig = () => {
				if (!body.oidcConfig) return null;

				if (body.oidcConfig.skipDiscovery) {
					return JSON.stringify({
						issuer: body.issuer,
						clientId: body.oidcConfig.clientId,
						clientSecret: body.oidcConfig.clientSecret,
						authorizationEndpoint: body.oidcConfig.authorizationEndpoint,
						tokenEndpoint: body.oidcConfig.tokenEndpoint,
						tokenEndpointAuthentication:
							body.oidcConfig.tokenEndpointAuthentication ||
							"client_secret_basic",
						privateKeyId: body.oidcConfig.privateKeyId,
						privateKeyAlgorithm: body.oidcConfig.privateKeyAlgorithm,
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
					});
				}

				if (!hydratedOIDCConfig) return null;

				return JSON.stringify({
					issuer: hydratedOIDCConfig.issuer,
					clientId: body.oidcConfig.clientId,
					clientSecret: body.oidcConfig.clientSecret,
					authorizationEndpoint: hydratedOIDCConfig.authorizationEndpoint,
					tokenEndpoint: hydratedOIDCConfig.tokenEndpoint,
					tokenEndpointAuthentication:
						hydratedOIDCConfig.tokenEndpointAuthentication,
					privateKeyId: body.oidcConfig.privateKeyId,
					privateKeyAlgorithm: body.oidcConfig.privateKeyAlgorithm,
					jwksEndpoint: hydratedOIDCConfig.jwksEndpoint,
					pkce: body.oidcConfig.pkce,
					discoveryEndpoint: hydratedOIDCConfig.discoveryEndpoint,
					mapping: body.oidcConfig.mapping,
					scopes: body.oidcConfig.scopes,
					userInfoEndpoint: hydratedOIDCConfig.userInfoEndpoint,
					overrideUserInfo:
						ctx.body.overrideUserInfo ||
						options?.defaultOverrideUserInfo ||
						false,
				});
			};

			if (body.samlConfig) {
				validateConfigAlgorithms(
					{
						signatureAlgorithm: body.samlConfig.signatureAlgorithm,
						digestAlgorithm: body.samlConfig.digestAlgorithm,
					},
					options?.saml?.algorithms,
				);

				validateCertSources(body.samlConfig);

				// Validate that the config has a usable IdP entry point
				const hasIdpMetadata = body.samlConfig.idpMetadata?.metadata;
				let hasEntryPoint = false;
				if (body.samlConfig.entryPoint) {
					try {
						new URL(body.samlConfig.entryPoint);
						hasEntryPoint = true;
					} catch {
						// not a valid URL
					}
				}
				const hasSingleSignOnService =
					body.samlConfig.idpMetadata?.singleSignOnService?.length;
				if (!hasIdpMetadata && !hasEntryPoint && !hasSingleSignOnService) {
					throw new APIError("BAD_REQUEST", {
						message:
							"SAML configuration requires either idpMetadata.metadata (IdP metadata XML), idpMetadata.singleSignOnService, or a valid entryPoint URL",
					});
				}
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
					...additionalFields,
					oidcConfig: (() => {
						const config = buildOIDCConfig();
						if (config) {
							const parsed = JSON.parse(config) as {
								tokenEndpointAuthentication?: string;
								clientSecret?: string;
							};
							if (
								parsed.tokenEndpointAuthentication !== "private_key_jwt" &&
								!parsed.clientSecret
							) {
								throw new APIError("BAD_REQUEST", {
									message:
										"clientSecret is required when using client_secret_basic or client_secret_post authentication",
								});
							}
							if (
								parsed.tokenEndpointAuthentication === "private_key_jwt" &&
								!options?.resolvePrivateKey &&
								!options?.defaultSSO?.some(
									(p: Record<string, unknown>) =>
										p.providerId === body.providerId &&
										"privateKey" in p &&
										p.privateKey,
								)
							) {
								throw new APIError("BAD_REQUEST", {
									message:
										"private_key_jwt authentication requires either a resolvePrivateKey callback or a privateKey in defaultSSO",
								});
							}
						}
						return config;
					})(),
					samlConfig: body.samlConfig
						? JSON.stringify({
								issuer: body.issuer,
								entryPoint: body.samlConfig.entryPoint,
								cert: body.samlConfig.cert,
								audience: body.samlConfig.audience,
								callbackUrl: body.samlConfig.callbackUrl,
								idpMetadata: body.samlConfig.idpMetadata,
								spMetadata: body.samlConfig.spMetadata,
								wantAssertionsSigned: body.samlConfig.wantAssertionsSigned,
								authnRequestsSigned: body.samlConfig.authnRequestsSigned,
								signatureAlgorithm: body.samlConfig.signatureAlgorithm,
								digestAlgorithm: body.samlConfig.digestAlgorithm,
								identifierFormat: body.samlConfig.identifierFormat,
								privateKey: body.samlConfig.privateKey,
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

				await ctx.context.internalAdapter.createVerificationValue({
					identifier: getVerificationIdentifier(options, provider.providerId),
					value: domainVerificationToken as string,
					expiresAt: new Date(Date.now() + 3600 * 24 * 7 * 1000), // 1 week
				});
			}

			type SSOProviderResponse = {
				redirectURI: string;
				oidcConfig: OIDCConfig | null;
				samlConfig: SAMLConfig | null;
			} & Omit<InferSSOProvider<O>, "oidcConfig" | "samlConfig">;

			type SSOProviderReturn = O["domainVerification"] extends { enabled: true }
				? SSOProviderResponse & {
						domainVerified: boolean;
						domainVerificationToken: string;
					}
				: SSOProviderResponse;

			const result = {
				...filterSSOProviderAdditionalFields(
					provider as unknown as Record<string, unknown>,
					options,
				),
				oidcConfig: safeJsonParse<OIDCConfig>(
					provider.oidcConfig as unknown as string,
				),
				samlConfig: safeJsonParse<SAMLConfig>(
					provider.samlConfig as unknown as string,
				),
				redirectURI: getOIDCRedirectURI(
					ctx.context.baseURL,
					provider.providerId,
					options,
				),
				...(options?.domainVerification?.enabled ? { domainVerified } : {}),
				...(options?.domainVerification?.enabled
					? { domainVerificationToken }
					: {}),
			};

			return ctx.json(result as SSOProviderReturn);
		},
	);
};

const signInSSOBodySchema = z.object({
	email: z
		.string({})
		.meta({
			description:
				"The email address to sign in with. Used to resolve the provider via the email domain; optional if providerId, domain, or organizationSlug is provided.",
		})
		.optional(),
	organizationSlug: z
		.string({})
		.meta({
			description: "The slug of the organization to sign in with.",
		})
		.optional(),
	providerId: z
		.string({})
		.meta({
			description:
				"The ID of the provider to sign in with. Can be provided instead of email.",
		})
		.optional(),
	domain: z
		.string({})
		.meta({
			description:
				"The email domain of the provider. Can be provided instead of email.",
		})
		.optional(),
	callbackURL: z.string({}).meta({
		description: "The URL to redirect to after successful sign-in.",
	}),
	errorCallbackURL: z
		.string({})
		.meta({
			description: "The URL to redirect to if the sign-in flow fails.",
		})
		.optional(),
	newUserCallbackURL: z
		.string({})
		.meta({
			description:
				"The URL to redirect to after sign-in if the user is newly registered.",
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
				"Login hint to send to the identity provider (e.g., email or identifier). If supported, sent as 'login_hint'.",
		})
		.optional(),
	additionalParams: additionalAuthorizationParamsSchema,
	requestSignUp: z
		.boolean({})
		.meta({
			description:
				"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider.",
		})
		.optional(),
	providerType: z
		.enum(["oidc", "saml"])
		.meta({
			description: "The provider protocol to sign in with.",
		})
		.optional(),
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
												"The email address to sign in with. Used to resolve the provider via the email domain; optional if providerId, domain, or organizationSlug is provided.",
										},
										organizationSlug: {
											type: "string",
											description:
												"The slug of the organization to sign in with.",
										},
										providerId: {
											type: "string",
											description:
												"The ID of the provider to sign in with. Can be provided instead of email.",
										},
										domain: {
											type: "string",
											description:
												"The email domain of the provider. Can be provided instead of email.",
										},
										callbackURL: {
											type: "string",
											description:
												"The URL to redirect to after successful sign-in.",
										},
										errorCallbackURL: {
											type: "string",
											description:
												"The URL to redirect to if the sign-in flow fails.",
										},
										newUserCallbackURL: {
											type: "string",
											description:
												"The URL to redirect to after sign-in if the user is newly registered.",
										},
										scopes: {
											type: "array",
											items: { type: "string" },
											description: "Scopes to request from the provider.",
										},
										loginHint: {
											type: "string",
											description:
												"Login hint to send to the identity provider (e.g., email or identifier). If supported, sent as 'login_hint'.",
										},
										additionalParams: {
											type: "object",
											additionalProperties: { type: "string" },
											description:
												"Extra query parameters to append to the OIDC provider authorization URL. RFC 6749 reserved keys (state, client_id, redirect_uri, response_type, code_challenge, code_challenge_method, scope) are rejected. Not supported for SAML providers.",
										},
										requestSignUp: {
											type: "boolean",
											description:
												"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider.",
										},
										providerType: {
											type: "string",
											enum: ["oidc", "saml"],
											description: "The provider protocol to sign in with.",
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
							(defaultProvider) =>
								domain && domainMatches(domain, defaultProvider.domain),
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
				const parseProvider = (res: SSOProvider<SSOOptions> | null) => {
					if (!res) return null;
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
				};

				if (providerId || orgId) {
					// Exact match for providerId or orgId
					provider = parseProvider(
						await ctx.context.adapter.findOne<SSOProvider<SSOOptions>>({
							model: "ssoProvider",
							where: [
								{
									field: providerId ? "providerId" : "organizationId",
									value: providerId || orgId!,
								},
							],
						}),
					);
				} else if (domain) {
					// For domain lookup, support comma-separated domains
					// First try exact match (fast path)
					provider = parseProvider(
						await ctx.context.adapter.findOne<SSOProvider<SSOOptions>>({
							model: "ssoProvider",
							where: [{ field: "domain", value: domain }],
						}),
					);
					// If not found, search all providers for comma-separated domain match
					if (!provider) {
						const allProviders = await ctx.context.adapter.findMany<
							SSOProvider<SSOOptions>
						>({
							model: "ssoProvider",
						});
						const matchingProvider = allProviders.find((p) =>
							domainMatches(domain, p.domain),
						);
						provider = parseProvider(matchingProvider ?? null);
					}
				}
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
				let config = provider.oidcConfig;
				try {
					config = await ensureRuntimeDiscovery(
						provider.oidcConfig,
						provider.issuer,
						(url) => ctx.context.isTrustedOrigin(url),
					);
				} catch (error) {
					if (error instanceof DiscoveryError) {
						throw mapDiscoveryErrorToAPIError(error);
					}
					throw error;
				}
				if (!config.authorizationEndpoint) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid OIDC configuration. Authorization URL not found.",
					});
				}
				if (options?.redirectURI?.trim()) {
					// The shared OIDC callback resolves the provider from server-only
					// state, so it must not be client-spoofable.
					await addOAuthServerContext({
						ssoProviderId: provider.providerId,
					});
				}
				const state = await generateState(ctx);
				const redirectURI = getOIDCRedirectURI(
					ctx.context.baseURL,
					provider.providerId,
					options,
				);
				const authorizationURL = await createAuthorizationURL({
					id: provider.issuer,
					options: {
						clientId: config.clientId,
						clientSecret: config.clientSecret,
					},
					redirectURI,
					state: state.state,
					codeVerifier: config.pkce ? state.codeVerifier : undefined,
					scopes: ctx.body.scopes ||
						config.scopes || ["openid", "email", "profile", "offline_access"],
					loginHint: ctx.body.loginHint || email,
					authorizationEndpoint: config.authorizationEndpoint,
					additionalParams: ctx.body.additionalParams,
				});
				return ctx.json({
					url: authorizationURL.toString(),
					redirect: true,
				});
			}
			if (provider.samlConfig) {
				if (ctx.body.additionalParams) {
					throw new APIError("BAD_REQUEST", {
						message:
							"additionalParams is not supported for SAML providers; the SAML AuthnRequest is signed and cannot carry caller-supplied query parameters.",
					});
				}
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

				if (
					parsedSamlConfig.authnRequestsSigned &&
					!parsedSamlConfig.spMetadata?.privateKey &&
					!parsedSamlConfig.privateKey
				) {
					throw new APIError("BAD_REQUEST", {
						message:
							"authnRequestsSigned is enabled but no privateKey provided in spMetadata or samlConfig",
					});
				}

				const { state: relayState } = await generateRelayState(ctx, undefined);

				const sp = createSP(
					parsedSamlConfig,
					ctx.context.baseURL,
					provider.providerId,
					{ relayState },
				);
				const idp = createIdP(parsedSamlConfig);
				const loginRequest = sp.createLoginRequest(
					idp,
					"redirect",
				) as BindingContext & {
					entityEndpoint: string;
					type: string;
					id: string;
				};
				if (!loginRequest) {
					throw new APIError("BAD_REQUEST", {
						message: "Invalid SAML request",
					});
				}

				const shouldSaveRequest =
					loginRequest.id &&
					options?.saml?.enableInResponseToValidation !== false;
				if (shouldSaveRequest) {
					const ttl =
						options?.saml?.requestTTL ?? constants.DEFAULT_AUTHN_REQUEST_TTL_MS;
					const record: AuthnRequestRecord = {
						id: loginRequest.id,
						providerId: provider.providerId,
						createdAt: Date.now(),
						expiresAt: Date.now() + ttl,
					};
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `${constants.AUTHN_REQUEST_KEY_PREFIX}${record.id}`,
						value: JSON.stringify(record),
						expiresAt: new Date(record.expiresAt),
					});
				}

				return ctx.json({
					url: loginRequest.context,
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
	state: z.string().optional(),
	error: z.string().optional(),
	error_description: z.string().optional(),
});

function getStringErrorField(value: unknown, field: string) {
	if (!value || typeof value !== "object") return;
	const fieldValue = (value as Record<string, unknown>)[field];
	return typeof fieldValue === "string" && fieldValue.length > 0
		? fieldValue
		: undefined;
}

function getOIDCErrorDescription(error: unknown, fallback: string): string {
	const nestedError =
		error && typeof error === "object"
			? (error as Record<string, unknown>).error
			: undefined;
	const description =
		getStringErrorField(nestedError, "error_description") ||
		getStringErrorField(error, "error_description") ||
		getStringErrorField(nestedError, "message") ||
		getStringErrorField(error, "message") ||
		getStringErrorField(error, "statusText") ||
		getStringErrorField(nestedError, "error") ||
		getStringErrorField(error, "error");
	if (description) return description;
	if (error && typeof error === "object") {
		const status = (error as Record<string, unknown>).status;
		if (typeof status === "number") return `HTTP ${status}`;
		if (typeof status === "string" && status.length > 0) return status;
	}
	return fallback;
}

/**
 * Core OIDC callback handler logic, shared between the per-provider and
 * shared callback endpoints. Resolves the provider, exchanges the
 * authorization code for tokens, and creates a session.
 *
 * @param stateData - Pre-parsed state data. If not provided, it will be
 *   parsed from the request context.
 */
async function handleOIDCCallback(
	ctx: any,
	options: SSOOptions | undefined,
	providerId: string,
	stateData?: Awaited<ReturnType<typeof parseState>>,
) {
	const { code, error, error_description } = ctx.query;
	if (!stateData) {
		stateData = await parseState(ctx);
	}
	if (!stateData) {
		const errorURL =
			ctx.context.options.onAPIError?.errorURL ||
			`${ctx.context.baseURL}/error`;
		throw ctx.redirect(`${errorURL}?error=invalid_state`);
	}
	const { callbackURL, errorURL, newUserURL, requestSignUp } = stateData;
	const redirectOIDCError = (error: string, description: string): never => {
		const baseURL = errorURL || callbackURL;
		const params = new URLSearchParams({
			error,
			error_description: description,
		});
		const separator = baseURL.includes("?") ? "&" : "?";
		throw ctx.redirect(`${baseURL}${separator}${params.toString()}`);
	};
	if (!code || error) {
		redirectOIDCError(
			error || "invalid_request",
			error_description || (error ? error : "authorization_code_not_found"),
		);
	}
	const provider = await resolveOIDCProvider(ctx, options, providerId);
	if (!provider) {
		throw ctx.redirect(
			`${
				errorURL || callbackURL
			}?error=invalid_provider&error_description=provider not found`,
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
			}?error=invalid_provider&error_description=provider not found`,
		);
	}

	try {
		config = await ensureRuntimeDiscovery(config, provider.issuer, (url) =>
			ctx.context.isTrustedOrigin(url),
		);
	} catch (error) {
		if (error instanceof DiscoveryError) {
			throw ctx.redirect(
				`${
					errorURL || callbackURL
				}?error=discovery_failed&error_description=${encodeURIComponent(error.message)}`,
			);
		}
		throw ctx.redirect(
			`${
				errorURL || callbackURL
			}?error=discovery_failed&error_description=unexpected_discovery_error`,
		);
	}
	if (!config.scopes) {
		config = {
			...config,
			scopes: ["openid", "email", "profile", "offline_access"],
		};
	}

	if (!config.tokenEndpoint) {
		throw ctx.redirect(
			`${
				errorURL || callbackURL
			}?error=invalid_provider&error_description=token_endpoint_not_found`,
		);
	}

	const tokenEndpoint = config.tokenEndpoint;
	let tokenEndpointAuth: TokenEndpointAuth =
		config.tokenEndpointAuthentication === "client_secret_post"
			? { method: "client_secret_post" }
			: { method: "client_secret_basic" };

	if (config.tokenEndpointAuthentication === "private_key_jwt") {
		type PrivateKeyResult = {
			privateKeyJwk?: JsonWebKey;
			privateKeyPem?: string;
			kid?: string;
			algorithm?: string;
		};
		let resolved: PrivateKeyResult | undefined;

		const matchingDefault = options?.defaultSSO?.find(
			(p: Record<string, unknown>) =>
				p.providerId === provider.providerId &&
				"privateKey" in p &&
				p.privateKey,
		);
		if (matchingDefault && "privateKey" in matchingDefault) {
			resolved = matchingDefault.privateKey as PrivateKeyResult;
		}

		if (!resolved && options?.resolvePrivateKey) {
			resolved = await options.resolvePrivateKey({
				providerId: provider.providerId,
				keyId: config.privateKeyId,
				issuer: config.issuer,
			});
		}

		if (!resolved || (!resolved.privateKeyJwk && !resolved.privateKeyPem)) {
			throw ctx.redirect(
				`${
					errorURL || callbackURL
				}?error=invalid_provider&error_description=no_private_key_available`,
			);
		}

		const rawAlg = config.privateKeyAlgorithm ?? resolved.algorithm;
		const algorithm: PrivateKeyJwtSigningAlgorithm | undefined =
			rawAlg &&
			(PRIVATE_KEY_JWT_SIGNING_ALGORITHMS as readonly string[]).includes(rawAlg)
				? (rawAlg as PrivateKeyJwtSigningAlgorithm)
				: undefined;

		tokenEndpointAuth = {
			method: "private_key_jwt",
			getClientAssertion: createPrivateKeyJwtClientAssertionGetter({
				privateKeyJwk: resolved.privateKeyJwk,
				privateKeyPem: resolved.privateKeyPem,
				kid: config.privateKeyId ?? resolved.kid,
				algorithm,
			}),
		};
	}

	const tokenRequestOptions: {
		clientId: string;
		clientSecret?: string | undefined;
	} = {
		clientId: config.clientId,
	};
	if (tokenEndpointAuth.method !== "private_key_jwt") {
		tokenRequestOptions.clientSecret = config.clientSecret;
	}

	const tokenResponse = await (async () => {
		const { body, headers } = await authorizationCodeRequest({
			code,
			codeVerifier: config.pkce ? stateData.codeVerifier : undefined,
			redirectURI: getOIDCRedirectURI(
				ctx.context.baseURL,
				provider.providerId,
				options,
			),
			options: tokenRequestOptions,
			tokenEndpoint,
			tokenEndpointAuth,
		});
		const { data, error } = await fetchOIDCEndpoint<object>(
			"tokenEndpoint",
			tokenEndpoint,
			{
				method: "POST",
				body,
				headers,
			},
			(url) => ctx.context.isTrustedOrigin(url),
		);
		if (error) {
			redirectOIDCError(
				"invalid_provider",
				getOIDCErrorDescription(error, "token_response_error"),
			);
		}
		if (!data) {
			throw new Error("Token endpoint returned an empty response");
		}
		return getOAuth2Tokens(data);
	})().catch((e) => {
		if (isAPIError(e)) {
			throw e;
		}
		ctx.context.logger.error("Error validating authorization code", e);
		if (e instanceof DiscoveryError) {
			redirectOIDCError("invalid_provider", e.message);
		}
		redirectOIDCError(
			"invalid_provider",
			getOIDCErrorDescription(e, "token_response_error"),
		);
	});
	if (!tokenResponse) {
		throw ctx.redirect(
			`${
				errorURL || callbackURL
			}?error=invalid_provider&error_description=token_response_not_found`,
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
	const mapping = config.mapping || {};
	// The raw, unmapped provider claims, forwarded to the validateUserInfo gate
	// as `source.sso.profile` so a policy can inspect provider-specific fields.
	let rawProfile: Record<string, unknown> | undefined;

	if (config.userInfoEndpoint) {
		const userInfoResponse = await fetchOIDCEndpoint<Record<string, unknown>>(
			"userInfoEndpoint",
			config.userInfoEndpoint,
			{
				headers: {
					Authorization: `Bearer ${tokenResponse.accessToken}`,
				},
			},
			(url) => ctx.context.isTrustedOrigin(url),
		).catch((e) => {
			if (e instanceof DiscoveryError) {
				redirectOIDCError("invalid_provider", e.message);
			}
			throw e;
		});
		if (userInfoResponse.error) {
			redirectOIDCError(
				"invalid_provider",
				userInfoResponse.error.message ||
					userInfoResponse.error.statusText ||
					"userinfo_response_error",
			);
		}
		const rawUserInfo =
			userInfoResponse.data ??
			redirectOIDCError("invalid_provider", "userinfo_response_not_found");
		rawProfile = rawUserInfo;
		userInfo = {
			...Object.fromEntries(
				Object.entries(mapping.extraFields || {}).map(([key, value]) => [
					key,
					rawUserInfo[value],
				]),
			),
			id: rawUserInfo[mapping.id || "sub"] as string | undefined,
			email: rawUserInfo[mapping.email || "email"] as string | undefined,
			emailVerified: options?.trustEmailVerified
				? parseProviderEmailVerified(
						rawUserInfo[mapping.emailVerified || "email_verified"],
					)
				: false,
			name: rawUserInfo[mapping.name || "name"] as string | undefined,
			image: rawUserInfo[mapping.image || "picture"] as string | undefined,
		};
	} else if (tokenResponse.idToken) {
		const idToken = decodeJwt(tokenResponse.idToken);
		rawProfile = idToken as Record<string, unknown>;
		if (!config.jwksEndpoint) {
			throw ctx.redirect(
				`${
					errorURL || callbackURL
				}?error=invalid_provider&error_description=jwks_endpoint_not_found`,
			);
		}
		const verified = await validateOIDCIdToken(
			tokenResponse.idToken,
			config.jwksEndpoint,
			{
				audience: config.clientId,
				issuer: provider.issuer,
			},
			(url) => ctx.context.isTrustedOrigin(url),
		).catch((e) => {
			if (e instanceof DiscoveryError) {
				redirectOIDCError("invalid_provider", e.message);
			}
			ctx.context.logger.error(e);
			return null;
		});
		if (!verified) {
			throw ctx.redirect(
				`${
					errorURL || callbackURL
				}?error=invalid_provider&error_description=token_not_verified`,
			);
		}

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
				? parseProviderEmailVerified(
						idToken[mapping.emailVerified || "email_verified"],
					)
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
	} else {
		throw ctx.redirect(
			`${
				errorURL || callbackURL
			}?error=invalid_provider&error_description=user_info_endpoint_not_found`,
		);
	}

	if (!userInfo.email || !userInfo.id) {
		throw ctx.redirect(
			`${
				errorURL || callbackURL
			}?error=invalid_provider&error_description=missing_user_info`,
		);
	}
	const userInfoEmail = userInfo.email;
	const userInfoId = userInfo.id;
	const isTrustedProvider =
		"domainVerified" in provider &&
		(provider as { domainVerified?: boolean }).domainVerified === true &&
		validateEmailDomain(userInfoEmail, provider.domain);

	let linked: Awaited<ReturnType<typeof handleOAuthUserInfo>>;
	try {
		linked = await runWithTransaction(ctx.context.adapter, async () => {
			await lockSSOProviderForAccountLink(ctx, provider);
			return handleOAuthUserInfo(ctx, {
				userInfo: {
					email: userInfoEmail,
					name: userInfo.name || "",
					id: userInfoId,
					image: userInfo.image,
					emailVerified: options?.trustEmailVerified
						? userInfo.emailVerified || false
						: false,
				},
				account: {
					idToken: tokenResponse.idToken,
					accessToken: tokenResponse.accessToken,
					refreshToken: tokenResponse.refreshToken,
					accountId: userInfoId,
					providerId: provider.providerId,
					accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
					refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
					scope: tokenResponse.scopes?.join(","),
				},
				callbackURL,
				disableSignUp: options?.disableImplicitSignUp && !requestSignUp,
				overrideUserInfo: config.overrideUserInfo,
				source: {
					method: "sso-oidc",
					sso: { providerId: provider.providerId, profile: rawProfile },
				},
				isTrustedProvider,
				// SSO provider ids are user-controlled and live in the same namespace
				// as social providers. Never inherit trust from the global
				// `trustedProviders` list by name — rely solely on the SSO-specific
				// `isTrustedProvider` (verified domain ownership) computed above.
				trustProviderByName: false,
			});
		});
	} catch (e) {
		if (isAPIError(e) && e.body?.code) {
			const baseURL = errorURL || callbackURL;
			const params = new URLSearchParams({ error: e.body.code });
			if (e.body.message) params.set("error_description", e.body.message);
			const sep = baseURL.includes("?") ? "&" : "?";
			throw ctx.redirect(`${baseURL}${sep}${params.toString()}`);
		}
		throw e;
	}
	if (linked.error) {
		const baseURL = errorURL || callbackURL;
		const params = new URLSearchParams({ error: linked.error });
		const sep = baseURL.includes("?") ? "&" : "?";
		throw ctx.redirect(`${baseURL}${sep}${params.toString()}`);
	}
	const { session, user } = linked.data!;

	if (
		options?.provisionUser &&
		(linked.isRegister || options.provisionUserOnEveryLogin)
	) {
		await options.provisionUser({
			user,
			userInfo,
			token: tokenResponse,
			provider,
		});
	}

	await assignOrganizationFromProvider(ctx as any, {
		user,
		profile: {
			providerType: "oidc",
			providerId: provider.providerId,
			accountId: userInfoId,
			email: userInfoEmail,
			emailVerified: Boolean(userInfo.emailVerified),
			rawAttributes: userInfo,
		},
		provider,
		token: tokenResponse,
		provisioningOptions: options?.organizationProvisioning,
	});

	await setSessionCookie(ctx, {
		session,
		user,
	});
	let toRedirectTo: string;
	try {
		const url = linked.isRegister ? newUserURL || callbackURL : callbackURL;
		toRedirectTo = url.toString();
	} catch {
		toRedirectTo = linked.isRegister ? newUserURL || callbackURL : callbackURL;
	}
	throw ctx.redirect(toRedirectTo);
}

const callbackSSOEndpointConfig = {
	method: "GET" as const,
	query: callbackSSOQuerySchema,
	allowedMediaTypes: [
		"application/x-www-form-urlencoded",
		"application/json",
	] as const,
	metadata: {
		...HIDE_METADATA,
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
};

/**
 * Resolves an SSO provider by `providerId`, first checking `options.defaultSSO`
 * and falling back to the `ssoProvider` table. Returns `null` when no match is
 * found so the caller can decide how to react (redirect, silently skip, etc.).
 */
async function resolveOIDCProvider(
	ctx: any,
	options: SSOOptions | undefined,
	providerId: string,
): Promise<SSOProvider<SSOOptions> | null> {
	const matchingDefault = options?.defaultSSO?.find(
		(defaultProvider) => defaultProvider.providerId === providerId,
	);
	if (matchingDefault) {
		return {
			...matchingDefault,
			issuer: matchingDefault.oidcConfig?.issuer || "",
			userId: "default",
			...(options?.domainVerification?.enabled ? { domainVerified: true } : {}),
		} as SSOProvider<SSOOptions>;
	}
	return ctx.context.adapter
		.findOne({
			model: "ssoProvider",
			where: [{ field: "providerId", value: providerId }],
		})
		.then((res: { oidcConfig: string } | null) => {
			if (!res) return null;
			return {
				...res,
				oidcConfig: safeJsonParse<OIDCConfig>(res.oidcConfig) || undefined,
			} as SSOProvider<SSOOptions>;
		});
}

/**
 * Restarts the OAuth flow server-side when a stateless callback arrives for
 * an OIDC provider that opted into IDP-initiated flows. Silently returns
 * otherwise, letting the normal handler produce its error redirect.
 */
async function bounceIfIdpInitiated(
	ctx: any,
	options: SSOOptions | undefined,
	providerId: string,
) {
	const provider = await resolveOIDCProvider(ctx, options, providerId);
	if (!provider?.oidcConfig?.allowIdpInitiated) return;

	let config = provider.oidcConfig;
	try {
		config = await ensureRuntimeDiscovery(config, provider.issuer, (url) =>
			ctx.context.isTrustedOrigin(url),
		);
	} catch (error) {
		ctx.context.logger.error(
			"IDP-initiated bounce skipped: OIDC discovery failed",
			{ providerId: provider.providerId, issuer: provider.issuer, error },
		);
		return;
	}
	if (!config.authorizationEndpoint) {
		ctx.context.logger.error(
			"IDP-initiated bounce skipped: authorizationEndpoint missing after discovery",
			{ providerId: provider.providerId, issuer: provider.issuer },
		);
		return;
	}

	if (options?.redirectURI?.trim()) {
		// The shared OIDC callback resolves the provider from server-only state,
		// so it must not be client-spoofable.
		await addOAuthServerContext({ ssoProviderId: provider.providerId });
	}
	const state = await generateState(ctx);
	const redirectURI = getOIDCRedirectURI(
		ctx.context.baseURL,
		provider.providerId,
		options,
	);
	const authorizationURL = await createAuthorizationURL({
		id: provider.issuer,
		options: {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
		},
		redirectURI,
		state: state.state,
		codeVerifier: config.pkce ? state.codeVerifier : undefined,
		scopes: config.scopes || ["openid", "email", "profile", "offline_access"],
		authorizationEndpoint: config.authorizationEndpoint,
	});
	throw ctx.redirect(authorizationURL.toString());
}

export const callbackSSO = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/callback/:providerId",
		callbackSSOEndpointConfig,
		async (ctx) => {
			const providerId = ctx.params.providerId;
			if (ctx.query.state === undefined && ctx.query.code) {
				await bounceIfIdpInitiated(ctx, options, providerId);
			}
			return handleOIDCCallback(ctx, options, providerId);
		},
	);
};

/**
 * Shared OIDC callback endpoint (no `:providerId` in path).
 * Used when `options.redirectURI` is set — the `providerId` is read from
 * the OAuth state instead of the URL path.
 */
export const callbackSSOShared = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/callback",
		{
			...callbackSSOEndpointConfig,
			metadata: {
				...callbackSSOEndpointConfig.metadata,
				openapi: {
					...callbackSSOEndpointConfig.metadata.openapi,
					operationId: "handleSSOCallbackShared",
					summary: "Shared callback URL for all SSO providers",
					description:
						"This endpoint is used as a shared callback URL for all SSO providers when `redirectURI` is configured. The provider is identified via the OAuth state parameter.",
				},
			},
		},
		async (ctx) => {
			const stateData = await parseState(ctx);
			if (!stateData) {
				const errorURL =
					ctx.context.options.onAPIError?.errorURL ||
					`${ctx.context.baseURL}/error`;
				throw ctx.redirect(`${errorURL}?error=invalid_state`);
			}

			const providerId = stateData.serverContext?.ssoProviderId as
				| string
				| undefined;
			if (!providerId) {
				const errorURL = stateData.errorURL || stateData.callbackURL;
				throw ctx.redirect(
					`${errorURL}?error=invalid_state&error_description=missing_provider_id`,
				);
			}

			return handleOIDCCallback(ctx, options, providerId, stateData);
		},
	);
};

const acsEndpointBodySchema = z.object({
	SAMLResponse: z.string(),
	RelayState: z.string().optional(),
});

export const acsEndpoint = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/saml2/sp/acs/:providerId",
		{
			method: ["GET", "POST"],
			body: acsEndpointBodySchema.optional(),
			query: z
				.object({
					RelayState: z.string().optional(),
				})
				.optional(),
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					operationId: "handleSAMLAssertionConsumerService",
					summary: "SAML Assertion Consumer Service",
					description:
						"Handles SAML responses from IdP after successful authentication. Supports GET for post-auth redirects and POST for SAML response processing.",
					responses: {
						"302": {
							description:
								"Redirects after authentication (success or error with query params)",
						},
						"400": {
							description: "Missing SAMLResponse in POST body",
						},
						"404": {
							description: "SAML provider not found",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { providerId } = ctx.params;
			const currentCallbackPath = `${ctx.context.baseURL}/sso/saml2/sp/acs/${providerId}`;
			const appOrigin = new URL(ctx.context.baseURL).origin;

			// GET: post-auth redirect (e.g., after IdP-initiated flow completes)
			const isGetRequest = ctx.method === "GET" && !ctx.body?.SAMLResponse;
			if (isGetRequest) {
				const session = await getSessionFromCtx(ctx);
				if (!session?.session) {
					const errorURL =
						ctx.context.options.onAPIError?.errorURL || `${appOrigin}/error`;
					throw ctx.redirect(`${errorURL}?error=invalid_request`);
				}
				const relayState = ctx.query?.RelayState as string | undefined;
				throw ctx.redirect(
					getSafeRedirectUrl(
						relayState,
						currentCallbackPath,
						appOrigin,
						(url, settings) => ctx.context.isTrustedOrigin(url, settings),
					),
				);
			}

			// POST: SAML response processing
			if (!ctx.body?.SAMLResponse) {
				throw new APIError("BAD_REQUEST", {
					message: "SAMLResponse is required for POST requests",
				});
			}

			try {
				const safeRedirectUrl = await processSAMLResponse(
					ctx,
					{
						SAMLResponse: ctx.body.SAMLResponse,
						RelayState: ctx.body.RelayState,
						providerId,
						currentCallbackPath,
					},
					options,
				);
				throw ctx.redirect(safeRedirectUrl);
			} catch (error) {
				if (
					error instanceof Response ||
					(error &&
						typeof error === "object" &&
						"status" in error &&
						(error as any).status === 302)
				) {
					throw error;
				}
				if (error instanceof APIError && error.statusCode === 400) {
					const errorCode = (error.body?.code || "saml_error").toLowerCase();
					const redirectUrl = getSafeRedirectUrl(
						ctx.body?.RelayState || undefined,
						currentCallbackPath,
						appOrigin,
						(url, settings) => ctx.context.isTrustedOrigin(url, settings),
					);
					throw ctx.redirect(
						`${redirectUrl}${redirectUrl.includes("?") ? "&" : "?"}error=${encodeURIComponent(errorCode)}&error_description=${encodeURIComponent(error.message)}`,
					);
				}
				throw error;
			}
		},
	);
};

const sloSchema = z.object({
	SAMLRequest: z.string().optional(),
	SAMLResponse: z.string().optional(),
	RelayState: z.string().optional(),
	SigAlg: z.string().optional(),
	Signature: z.string().optional(),
});

export const sloEndpoint = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/saml2/sp/slo/:providerId",
		{
			method: ["GET", "POST"],
			body: sloSchema.optional(),
			query: sloSchema.optional(),
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
			},
		},
		async (ctx) => {
			if (!options?.saml?.enableSingleLogout) {
				throw APIError.from(
					"BAD_REQUEST",
					SAML_ERROR_CODES.SINGLE_LOGOUT_NOT_ENABLED,
				);
			}

			const { providerId } = ctx.params;

			const samlRequest = ctx.body?.SAMLRequest || ctx.query?.SAMLRequest;
			const samlResponse = ctx.body?.SAMLResponse || ctx.query?.SAMLResponse;
			const relayState = ctx.body?.RelayState || ctx.query?.RelayState;
			const appOrigin = new URL(ctx.context.baseURL).origin;
			const safeErrorURL = getSafeRedirectUrl(
				relayState,
				`${appOrigin}/sso/saml2/sp/slo/${providerId}`,
				appOrigin,
				(url, settings) => ctx.context.isTrustedOrigin(url, settings),
			);

			if (!samlRequest && !samlResponse) {
				throw ctx.redirect(
					`${safeErrorURL}?error=invalid_request&error_description=missing_logout_data`,
				);
			}

			const provider = await findSAMLProvider(
				providerId,
				options,
				ctx.context.adapter,
			);
			if (!provider?.samlConfig) {
				throw APIError.from(
					"NOT_FOUND",
					SAML_ERROR_CODES.SAML_PROVIDER_NOT_FOUND,
				);
			}

			const config = provider.samlConfig as SAMLConfig;
			const sp = createSP(config, ctx.context.baseURL, providerId, {
				sloOptions: {
					wantLogoutRequestSigned: options?.saml?.wantLogoutRequestSigned,
					wantLogoutResponseSigned: options?.saml?.wantLogoutResponseSigned,
				},
			});
			const idp = createIdP(config);

			if (samlResponse) {
				return handleLogoutResponse(ctx, sp, idp, relayState, providerId);
			}

			return handleLogoutRequest(ctx, sp, idp, relayState, providerId);
		},
	);
};

async function handleLogoutResponse(
	ctx: any,
	sp: ReturnType<typeof createSP>,
	idp: ReturnType<typeof createIdP>,
	relayState: string | undefined,
	providerId: string,
) {
	const binding =
		ctx.method === "POST" && ctx.body?.SAMLResponse ? "post" : "redirect";

	let parsed: Awaited<ReturnType<typeof sp.parseLogoutResponse>> | undefined;
	try {
		parsed = await sp.parseLogoutResponse(idp, binding, {
			body: ctx.body,
			query: ctx.query,
		});
	} catch (error) {
		ctx.context.logger.error("LogoutResponse validation failed", { error });
		throw APIError.from(
			"BAD_REQUEST",
			SAML_ERROR_CODES.INVALID_LOGOUT_RESPONSE,
		);
	}

	const extract = parsed?.extract as {
		response?: { inResponseTo?: string };
		status?: string;
		statusCode?: string;
	};

	const statusCode =
		extract?.statusCode ||
		extract?.status ||
		(parsed as any)?.samlContent?.status?.statusCode;
	if (statusCode && statusCode !== constants.SAML_STATUS_SUCCESS) {
		ctx.context.logger.warn("LogoutResponse indicates failure", { statusCode });
		throw APIError.from("BAD_REQUEST", SAML_ERROR_CODES.LOGOUT_FAILED_AT_IDP);
	}

	const inResponseTo = extract?.response?.inResponseTo;
	if (inResponseTo) {
		const key = `${constants.LOGOUT_REQUEST_KEY_PREFIX}${inResponseTo}`;
		const pendingRequest =
			await ctx.context.internalAdapter.findVerificationValue(key);

		if (!pendingRequest) {
			ctx.context.logger.warn(
				"LogoutResponse references unknown or expired request",
				{ inResponseTo },
			);
		}

		await ctx.context.internalAdapter
			.deleteVerificationByIdentifier(key)
			.catch((e: unknown) =>
				ctx.context.logger.warn(
					"Failed to delete logout request verification value",
					e,
				),
			);
	}

	deleteSessionCookie(ctx);

	const appOrigin = new URL(ctx.context.baseURL).origin;
	const safeRedirectUrl = getSafeRedirectUrl(
		relayState,
		`${appOrigin}/sso/saml2/sp/slo/${providerId}`,
		appOrigin,
		(url, settings) => ctx.context.isTrustedOrigin(url, settings),
	);
	throw ctx.redirect(safeRedirectUrl);
}

async function handleLogoutRequest(
	ctx: any,
	sp: ReturnType<typeof createSP>,
	idp: ReturnType<typeof createIdP>,
	relayState: string | undefined,
	providerId: string,
) {
	const binding =
		ctx.method === "POST" && ctx.body?.SAMLRequest ? "post" : "redirect";

	let parsed: Awaited<ReturnType<typeof sp.parseLogoutRequest>> | undefined;
	try {
		parsed = await sp.parseLogoutRequest(idp, binding, {
			body: ctx.body,
			query: ctx.query,
		});
	} catch (error) {
		ctx.context.logger.error("LogoutRequest validation failed", { error });
		throw APIError.from("BAD_REQUEST", SAML_ERROR_CODES.INVALID_LOGOUT_REQUEST);
	}
	if (!parsed?.extract) {
		throw APIError.from("BAD_REQUEST", SAML_ERROR_CODES.INVALID_LOGOUT_REQUEST);
	}

	const { nameID } = parsed.extract;
	// LogoutRequest SessionIndex is a plain string (unlike login response
	// where samlify nests it as { sessionIndex: string } from AuthnStatement)
	const sessionIndex = parsed.extract.sessionIndex as string | undefined;

	const key = `${constants.SAML_SESSION_KEY_PREFIX}${providerId}:${nameID}`;
	const stored = await ctx.context.internalAdapter.findVerificationValue(key);

	if (stored) {
		const data = safeJsonParse<SAMLSessionRecord>(stored.value);
		if (data) {
			if (
				!sessionIndex ||
				!data.sessionIndex ||
				sessionIndex === data.sessionIndex
			) {
				await ctx.context.internalAdapter
					.deleteSession(data.sessionToken)
					.catch((e: unknown) =>
						ctx.context.logger.warn("Failed to delete session during SLO", {
							error: e,
						}),
					);
				await ctx.context.internalAdapter
					.deleteVerificationByIdentifier(
						`${constants.SAML_SESSION_BY_ID_PREFIX}${data.sessionId}`,
					)
					.catch((e: unknown) =>
						ctx.context.logger.warn(
							"Failed to delete SAML session lookup during SLO",
							e,
						),
					);
			} else {
				ctx.context.logger.warn(
					"SessionIndex mismatch in LogoutRequest - skipping session deletion",
					{
						providerId,
						requestedSessionIndex: sessionIndex,
						storedSessionIndex: data.sessionIndex,
					},
				);
			}
		}
		await ctx.context.internalAdapter
			.deleteVerificationByIdentifier(key)
			.catch((e: unknown) =>
				ctx.context.logger.warn(
					"Failed to delete SAML session key during SLO",
					e,
				),
			);
	}

	const currentSession = await getSessionFromCtx(ctx);
	if (currentSession?.session) {
		await ctx.context.internalAdapter.deleteSession(
			currentSession.session.token,
		);
	}

	deleteSessionCookie(ctx);

	// Pass the parsed request so samlify links `InResponseTo` and fills the
	// response template (ID, Issuer, IssueInstant, Destination, StatusCode).
	const res = sp.createLogoutResponse(
		idp,
		parsed as unknown as RequestInfo,
		binding,
		relayState || "",
	) as {
		context: string;
		entityEndpoint?: string;
	};

	if (binding === "post" && res.entityEndpoint) {
		return createSAMLPostForm(
			res.entityEndpoint,
			"SAMLResponse",
			res.context,
			relayState,
		);
	}
	throw ctx.redirect(res.context);
}

export const initiateSLO = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/saml2/logout/:providerId",
		{
			method: "POST",
			body: z.object({
				callbackURL: z.string().optional(),
			}),
			use: [sessionMiddleware],
			metadata: HIDE_METADATA,
		},
		async (ctx) => {
			if (!options?.saml?.enableSingleLogout) {
				throw APIError.from(
					"BAD_REQUEST",
					SAML_ERROR_CODES.SINGLE_LOGOUT_NOT_ENABLED,
				);
			}

			const { providerId } = ctx.params;
			const callbackURL = ctx.body.callbackURL || ctx.context.baseURL;

			const provider = await findSAMLProvider(
				providerId,
				options,
				ctx.context.adapter,
			);
			if (!provider?.samlConfig) {
				throw APIError.from(
					"NOT_FOUND",
					SAML_ERROR_CODES.SAML_PROVIDER_NOT_FOUND,
				);
			}

			const config = provider.samlConfig as SAMLConfig;

			const idpHasSLO =
				config.idpMetadata?.singleLogoutService?.length ||
				(config.idpMetadata?.metadata &&
					config.idpMetadata.metadata.includes("SingleLogoutService"));
			if (!idpHasSLO) {
				throw APIError.from(
					"BAD_REQUEST",
					SAML_ERROR_CODES.IDP_SLO_NOT_SUPPORTED,
				);
			}

			const sp = createSP(config, ctx.context.baseURL, providerId, {
				sloOptions: {
					wantLogoutRequestSigned: options?.saml?.wantLogoutRequestSigned,
					wantLogoutResponseSigned: options?.saml?.wantLogoutResponseSigned,
				},
			});
			const idp = createIdP(config);

			const session = ctx.context.session;
			const sessionLookupKey = `${constants.SAML_SESSION_BY_ID_PREFIX}${session.session.id}`;
			const sessionLookup =
				await ctx.context.internalAdapter.findVerificationValue(
					sessionLookupKey,
				);

			let nameID = session.user.email;
			let sessionIndex: string | undefined;
			let samlSessionKey: string | undefined;

			if (sessionLookup) {
				samlSessionKey = sessionLookup.value;
				const stored =
					await ctx.context.internalAdapter.findVerificationValue(
						samlSessionKey,
					);
				if (stored) {
					const data = safeJsonParse<SAMLSessionRecord>(stored.value);
					if (data) {
						nameID = data.nameID || nameID;
						sessionIndex = data.sessionIndex;
					}
				}
			}

			const logoutRequest = sp.createLogoutRequest(idp, "redirect", {
				logoutNameID: nameID,
				sessionIndex,
				relayState: callbackURL,
			}) as { id: string; context: string };

			const ttl =
				options?.saml?.logoutRequestTTL ??
				constants.DEFAULT_LOGOUT_REQUEST_TTL_MS;
			await ctx.context.internalAdapter.createVerificationValue({
				identifier: `${constants.LOGOUT_REQUEST_KEY_PREFIX}${logoutRequest.id}`,
				value: providerId,
				expiresAt: new Date(Date.now() + ttl),
			});

			if (samlSessionKey) {
				await ctx.context.internalAdapter
					.deleteVerificationByIdentifier(samlSessionKey)
					.catch((e) =>
						ctx.context.logger.warn(
							"Failed to delete SAML session key during logout",
							e,
						),
					);
			}
			await ctx.context.internalAdapter
				.deleteVerificationByIdentifier(sessionLookupKey)
				.catch((e) =>
					ctx.context.logger.warn(
						"Failed to delete session lookup key during logout",
						e,
					),
				);

			await ctx.context.internalAdapter.deleteSession(session.session.token);

			deleteSessionCookie(ctx);

			throw ctx.redirect(logoutRequest.context);
		},
	);
};
