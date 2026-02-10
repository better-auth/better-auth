import { base64 } from "@better-auth/utils/base64";
import { BetterFetchError, betterFetch } from "@better-fetch/fetch";
import type { User, Verification } from "better-auth";
import {
	createAuthorizationURL,
	generateState,
	HIDE_METADATA,
	parseState,
	validateAuthorizationCode,
	validateToken,
} from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	getSessionFromCtx,
	sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { XMLParser } from "fast-xml-parser";
import { decodeJwt } from "jose";
import * as saml from "samlify";
import type { BindingContext } from "samlify/types/src/entity";
import type { IdentityProvider } from "samlify/types/src/entity-idp";
import type { FlowResult } from "samlify/types/src/flow";
import z from "zod/v4";
import { getVerificationIdentifier } from "./domain-verification";

interface AuthnRequestRecord {
	id: string;
	providerId: string;
	createdAt: number;
	expiresAt: number;
}

import {
	AUTHN_REQUEST_KEY_PREFIX,
	DEFAULT_ASSERTION_TTL_MS,
	DEFAULT_AUTHN_REQUEST_TTL_MS,
	DEFAULT_CLOCK_SKEW_MS,
	DEFAULT_MAX_SAML_METADATA_SIZE,
	DEFAULT_MAX_SAML_RESPONSE_SIZE,
	USED_ASSERTION_KEY_PREFIX,
} from "../constants";
import { assignOrganizationFromProvider } from "../linking";
import type { HydratedOIDCConfig } from "../oidc";
import {
	DiscoveryError,
	discoverOIDCConfig,
	mapDiscoveryErrorToAPIError,
} from "../oidc";
import {
	validateConfigAlgorithms,
	validateSAMLAlgorithms,
	validateSingleAssertion,
} from "../saml";
import { generateRelayState, parseRelayState } from "../saml-state";
import type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider } from "../types";
import { domainMatches, safeJsonParse, validateEmailDomain } from "../utils";

export interface TimestampValidationOptions {
	clockSkew?: number;
	requireTimestamps?: boolean;
	logger?: {
		warn: (message: string, data?: Record<string, unknown>) => void;
	};
}

/** Conditions extracted from SAML assertion */
export interface SAMLConditions {
	notBefore?: string;
	notOnOrAfter?: string;
}

/**
 * Validates SAML assertion timestamp conditions (NotBefore/NotOnOrAfter).
 * Prevents acceptance of expired or future-dated assertions.
 * @throws {APIError} If timestamps are invalid, expired, or not yet valid
 */
export function validateSAMLTimestamp(
	conditions: SAMLConditions | undefined,
	options: TimestampValidationOptions = {},
): void {
	const clockSkew = options.clockSkew ?? DEFAULT_CLOCK_SKEW_MS;
	const hasTimestamps = conditions?.notBefore || conditions?.notOnOrAfter;

	if (!hasTimestamps) {
		if (options.requireTimestamps) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion missing required timestamp conditions",
				details:
					"Assertions must include NotBefore and/or NotOnOrAfter conditions",
			});
		}
		// Log warning for missing timestamps when not required
		options.logger?.warn(
			"SAML assertion accepted without timestamp conditions",
			{ hasConditions: !!conditions },
		);
		return;
	}

	const now = Date.now();

	if (conditions?.notBefore) {
		const notBeforeTime = new Date(conditions.notBefore).getTime();
		if (Number.isNaN(notBeforeTime)) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion has invalid NotBefore timestamp",
				details: `Unable to parse NotBefore value: ${conditions.notBefore}`,
			});
		}
		if (now < notBeforeTime - clockSkew) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion is not yet valid",
				details: `Current time is before NotBefore (with ${clockSkew}ms clock skew tolerance)`,
			});
		}
	}

	if (conditions?.notOnOrAfter) {
		const notOnOrAfterTime = new Date(conditions.notOnOrAfter).getTime();
		if (Number.isNaN(notOnOrAfterTime)) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion has invalid NotOnOrAfter timestamp",
				details: `Unable to parse NotOnOrAfter value: ${conditions.notOnOrAfter}`,
			});
		}
		if (now > notOnOrAfterTime + clockSkew) {
			throw new APIError("BAD_REQUEST", {
				message: "SAML assertion has expired",
				details: `Current time is after NotOnOrAfter (with ${clockSkew}ms clock skew tolerance)`,
			});
		}
	}
}

/**
 * Extracts the Assertion ID from a SAML response XML.
 * Returns null if the assertion ID cannot be found.
 */
function extractAssertionId(samlContent: string): string | null {
	try {
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			removeNSPrefix: true,
		});
		const parsed = parser.parse(samlContent);

		const response = parsed.Response || parsed["samlp:Response"];
		if (!response) return null;

		const rawAssertion = response.Assertion || response["saml:Assertion"];
		const assertion = Array.isArray(rawAssertion)
			? rawAssertion[0]
			: rawAssertion;
		if (!assertion) return null;

		return assertion["@_ID"] || null;
	} catch {
		return null;
	}
}

const spMetadataQuerySchema = z.object({
	providerId: z.string(),
	format: z.enum(["xml", "json"]).default("xml"),
});

type RelayState = Awaited<ReturnType<typeof parseRelayState>>;

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
						authnRequestsSigned: parsedSamlConfig.authnRequestsSigned || false,
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
		description:
			"The domain(s) of the provider. For enterprise multi-domain SSO where a single IdP serves multiple email domains, use comma-separated values (e.g., 'company.com,subsidiary.com,acquired-company.com')",
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
			skipDiscovery: z
				.boolean()
				.meta({
					description:
						"Skip OIDC discovery during registration. When true, you must provide authorizationEndpoint, tokenEndpoint, and jwksEndpoint manually.",
				})
				.optional(),
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

			if (body.samlConfig?.idpMetadata?.metadata) {
				const maxMetadataSize =
					options?.saml?.maxMetadataSize ?? DEFAULT_MAX_SAML_METADATA_SIZE;
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
					oidcConfig: buildOIDCConfig(),
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
						identifier: getVerificationIdentifier(options, provider.providerId),
						createdAt: new Date(),
						updatedAt: new Date(),
						value: domainVerificationToken as string,
						expiresAt: new Date(Date.now() + 3600 * 24 * 7 * 1000), // 1 week
					},
				});
			}

			type SSOProviderResponse = {
				redirectURI: string;
				oidcConfig: OIDCConfig | null;
				samlConfig: SAMLConfig | null;
			} & Omit<SSOProvider<O>, "oidcConfig" | "samlConfig">;

			type SSOProviderReturn = O["domainVerification"] extends { enabled: true }
				? SSOProviderResponse & {
						domainVerified: boolean;
						domainVerificationToken: string;
					}
				: SSOProviderResponse;

			const result = {
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
								authnRequestsSigned:
									parsedSamlConfig.authnRequestsSigned || false,
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
					privateKey:
						parsedSamlConfig.spMetadata?.privateKey ||
						parsedSamlConfig.privateKey,
					privateKeyPass: parsedSamlConfig.spMetadata?.privateKeyPass,
					allowCreate: true,
				});

				const idpData = parsedSamlConfig.idpMetadata;
				let idp: IdentityProvider;
				if (!idpData?.metadata) {
					idp = saml.IdentityProvider({
						entityID: idpData?.entityID || parsedSamlConfig.issuer,
						singleSignOnService: idpData?.singleSignOnService || [
							{
								Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
								Location: parsedSamlConfig.entryPoint,
							},
						],
						signingCert: idpData?.cert || parsedSamlConfig.cert,
						wantAuthnRequestsSigned:
							parsedSamlConfig.authnRequestsSigned || false,
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

				const { state: relayState } = await generateRelayState(
					ctx,
					undefined,
					false,
				);

				const shouldSaveRequest =
					loginRequest.id && options?.saml?.enableInResponseToValidation;
				if (shouldSaveRequest) {
					const ttl = options?.saml?.requestTTL ?? DEFAULT_AUTHN_REQUEST_TTL_MS;
					const record: AuthnRequestRecord = {
						id: loginRequest.id,
						providerId: provider.providerId,
						createdAt: Date.now(),
						expiresAt: Date.now() + ttl,
					};
					await ctx.context.internalAdapter.createVerificationValue({
						identifier: `${AUTHN_REQUEST_KEY_PREFIX}${record.id}`,
						value: JSON.stringify(record),
						expiresAt: new Date(record.expiresAt),
					});
				}

				return ctx.json({
					url: `${loginRequest.context}&RelayState=${encodeURIComponent(relayState)}`,
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
		},
		async (ctx) => {
			const { code, error, error_description } = ctx.query;
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
					}?error=invalid_provider&error_description=token_endpoint_not_found`,
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
			if (tokenResponse.idToken) {
				const idToken = decodeJwt(tokenResponse.idToken);
				if (!config.jwksEndpoint) {
					throw ctx.redirect(
						`${
							errorURL || callbackURL
						}?error=invalid_provider&error_description=jwks_endpoint_not_found`,
					);
				}
				const verified = await validateToken(
					tokenResponse.idToken,
					config.jwksEndpoint,
					{
						audience: config.clientId,
						issuer: provider.issuer,
					},
				).catch((e) => {
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
						}?error=invalid_provider&error_description=user_info_endpoint_not_found`,
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
						}?error=invalid_provider&error_description=${
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
					}?error=invalid_provider&error_description=missing_user_info`,
				);
			}
			const isTrustedProvider =
				"domainVerified" in provider &&
				(provider as { domainVerified?: boolean }).domainVerified === true &&
				validateEmailDomain(userInfo.email, provider.domain);

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
				isTrustedProvider,
			});
			if (linked.error) {
				throw ctx.redirect(`${errorURL || callbackURL}?error=${linked.error}`);
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

			await assignOrganizationFromProvider(ctx as any, {
				user,
				profile: {
					providerType: "oidc",
					providerId: provider.providerId,
					accountId: userInfo.id,
					email: userInfo.email,
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

/**
 * Validates and returns a safe redirect URL.
 * - Prevents open redirect attacks by validating against trusted origins
 * - Prevents redirect loops by checking if URL points to callback route
 * - Falls back to appOrigin if URL is invalid or unsafe
 */
const getSafeRedirectUrl = (
	url: string | undefined,
	callbackPath: string,
	appOrigin: string,
	isTrustedOrigin: (
		url: string,
		settings?: { allowRelativePaths: boolean },
	) => boolean,
): string => {
	if (!url) {
		return appOrigin;
	}

	if (url.startsWith("/") && !url.startsWith("//")) {
		try {
			const absoluteUrl = new URL(url, appOrigin);
			if (absoluteUrl.origin !== appOrigin) {
				return appOrigin;
			}
			const callbackPathname = new URL(callbackPath).pathname;
			if (absoluteUrl.pathname === callbackPathname) {
				return appOrigin;
			}
		} catch {
			return appOrigin;
		}
		return url;
	}

	if (!isTrustedOrigin(url, { allowRelativePaths: false })) {
		return appOrigin;
	}

	try {
		const callbackPathname = new URL(callbackPath).pathname;
		const urlPathname = new URL(url).pathname;
		if (urlPathname === callbackPathname) {
			return appOrigin;
		}
	} catch {
		if (url === callbackPath || url.startsWith(`${callbackPath}?`)) {
			return appOrigin;
		}
	}

	return url;
};

export const callbackSSOSAML = (options?: SSOOptions) => {
	return createAuthEndpoint(
		"/sso/saml2/callback/:providerId",
		{
			method: ["GET", "POST"],
			body: callbackSSOSAMLBodySchema.optional(),
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
					operationId: "handleSAMLCallback",
					summary: "Callback URL for SAML provider",
					description:
						"This endpoint is used as the callback URL for SAML providers. Supports both GET and POST methods for IdP-initiated and SP-initiated flows.",
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
			const { providerId } = ctx.params;
			const appOrigin = new URL(ctx.context.baseURL).origin;
			const errorURL =
				ctx.context.options.onAPIError?.errorURL || `${appOrigin}/error`;
			const currentCallbackPath = `${ctx.context.baseURL}/sso/saml2/callback/${providerId}`;

			// Determine if this is a GET request by checking both method AND body presence
			// When called via auth.api.*, ctx.method may not be reliable, so we also check for body
			const isGetRequest = ctx.method === "GET" && !ctx.body?.SAMLResponse;

			if (isGetRequest) {
				const session = await getSessionFromCtx(ctx);

				if (!session?.session) {
					throw ctx.redirect(`${errorURL}?error=invalid_request`);
				}

				const relayState = ctx.query?.RelayState as string | undefined;
				const safeRedirectUrl = getSafeRedirectUrl(
					relayState,
					currentCallbackPath,
					appOrigin,
					(url, settings) => ctx.context.isTrustedOrigin(url, settings),
				);

				throw ctx.redirect(safeRedirectUrl);
			}

			if (!ctx.body?.SAMLResponse) {
				throw new APIError("BAD_REQUEST", {
					message: "SAMLResponse is required for POST requests",
				});
			}

			const { SAMLResponse } = ctx.body;

			const maxResponseSize =
				options?.saml?.maxResponseSize ?? DEFAULT_MAX_SAML_RESPONSE_SIZE;
			if (new TextEncoder().encode(SAMLResponse).length > maxResponseSize) {
				throw new APIError("BAD_REQUEST", {
					message: `SAML response exceeds maximum allowed size (${maxResponseSize} bytes)`,
				});
			}

			let relayState: RelayState | null = null;
			if (ctx.body.RelayState) {
				try {
					relayState = await parseRelayState(ctx);
				} catch {
					relayState = null;
				}
			}
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

			const isTrusted = (
				url: string,
				settings?: { allowRelativePaths: boolean },
			) => ctx.context.isTrustedOrigin(url, settings);

			const safeErrorUrl = getSafeRedirectUrl(
				relayState?.errorURL ||
					relayState?.callbackURL ||
					parsedSamlConfig.callbackUrl,
				currentCallbackPath,
				appOrigin,
				isTrusted,
			);

			const idpData = parsedSamlConfig.idpMetadata;
			let idp: IdentityProvider | null = null;

			// Construct IDP with fallback to manual configuration
			if (!idpData?.metadata) {
				idp = saml.IdentityProvider({
					entityID: idpData?.entityID || parsedSamlConfig.issuer,
					singleSignOnService: idpData?.singleSignOnService || [
						{
							Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
							Location: parsedSamlConfig.entryPoint,
						},
					],
					signingCert: idpData?.cert || parsedSamlConfig.cert,
					wantAuthnRequestsSigned:
						parsedSamlConfig.authnRequestsSigned || false,
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

			validateSingleAssertion(SAMLResponse);

			let parsedResponse: FlowResult;
			try {
				parsedResponse = await sp.parseLoginResponse(idp, "post", {
					body: {
						SAMLResponse,
						RelayState: ctx.body.RelayState || undefined,
					},
				});

				if (!parsedResponse?.extract) {
					throw new Error("Invalid SAML response structure");
				}
			} catch (error) {
				ctx.context.logger.error("SAML response validation failed", {
					error,
					decodedResponse: new TextDecoder().decode(
						base64.decode(SAMLResponse),
					),
				});
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML response",
					details: error instanceof Error ? error.message : String(error),
				});
			}

			const { extract } = parsedResponse!;

			validateSAMLAlgorithms(parsedResponse, options?.saml?.algorithms);

			validateSAMLTimestamp((extract as any).conditions, {
				clockSkew: options?.saml?.clockSkew,
				requireTimestamps: options?.saml?.requireTimestamps,
				logger: ctx.context.logger,
			});

			const inResponseTo = (extract as any).inResponseTo as string | undefined;
			const shouldValidateInResponseTo =
				options?.saml?.enableInResponseToValidation;

			if (shouldValidateInResponseTo) {
				const allowIdpInitiated = options?.saml?.allowIdpInitiated !== false;

				if (inResponseTo) {
					let storedRequest: AuthnRequestRecord | null = null;

					const verification =
						await ctx.context.internalAdapter.findVerificationValue(
							`${AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
						);
					if (verification) {
						try {
							storedRequest = JSON.parse(
								verification.value,
							) as AuthnRequestRecord;
							if (storedRequest && storedRequest.expiresAt < Date.now()) {
								storedRequest = null;
							}
						} catch {
							storedRequest = null;
						}
					}

					if (!storedRequest) {
						ctx.context.logger.error(
							"SAML InResponseTo validation failed: unknown or expired request ID",
							{ inResponseTo, providerId: provider.providerId },
						);
						throw ctx.redirect(
							`${safeErrorUrl}?error=invalid_saml_response&error_description=Unknown+or+expired+request+ID`,
						);
					}

					if (storedRequest.providerId !== provider.providerId) {
						ctx.context.logger.error(
							"SAML InResponseTo validation failed: provider mismatch",
							{
								inResponseTo,
								expectedProvider: storedRequest.providerId,
								actualProvider: provider.providerId,
							},
						);

						await ctx.context.internalAdapter.deleteVerificationByIdentifier(
							`${AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
						);
						throw ctx.redirect(
							`${safeErrorUrl}?error=invalid_saml_response&error_description=Provider+mismatch`,
						);
					}

					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						`${AUTHN_REQUEST_KEY_PREFIX}${inResponseTo}`,
					);
				} else if (!allowIdpInitiated) {
					ctx.context.logger.error(
						"SAML IdP-initiated SSO rejected: InResponseTo missing and allowIdpInitiated is false",
						{ providerId: provider.providerId },
					);
					throw ctx.redirect(
						`${safeErrorUrl}?error=unsolicited_response&error_description=IdP-initiated+SSO+not+allowed`,
					);
				}
			}

			// Assertion Replay Protection
			const samlContent = (parsedResponse as any).samlContent as
				| string
				| undefined;
			const assertionId = samlContent ? extractAssertionId(samlContent) : null;

			if (assertionId) {
				const issuer = idp.entityMeta.getEntityID();
				const conditions = (extract as any).conditions as
					| SAMLConditions
					| undefined;
				const clockSkew = options?.saml?.clockSkew ?? DEFAULT_CLOCK_SKEW_MS;
				const expiresAt = conditions?.notOnOrAfter
					? new Date(conditions.notOnOrAfter).getTime() + clockSkew
					: Date.now() + DEFAULT_ASSERTION_TTL_MS;

				const existingAssertion =
					await ctx.context.internalAdapter.findVerificationValue(
						`${USED_ASSERTION_KEY_PREFIX}${assertionId}`,
					);

				let isReplay = false;
				if (existingAssertion) {
					try {
						const stored = JSON.parse(existingAssertion.value);
						if (stored.expiresAt >= Date.now()) {
							isReplay = true;
						}
					} catch (error) {
						ctx.context.logger.warn("Failed to parse stored assertion record", {
							assertionId,
							error,
						});
					}
				}

				if (isReplay) {
					ctx.context.logger.error(
						"SAML assertion replay detected: assertion ID already used",
						{
							assertionId,
							issuer,
							providerId: provider.providerId,
						},
					);
					throw ctx.redirect(
						`${safeErrorUrl}?error=replay_detected&error_description=SAML+assertion+has+already+been+used`,
					);
				}

				await ctx.context.internalAdapter.createVerificationValue({
					identifier: `${USED_ASSERTION_KEY_PREFIX}${assertionId}`,
					value: JSON.stringify({
						assertionId,
						issuer,
						providerId: provider.providerId,
						usedAt: Date.now(),
						expiresAt,
					}),
					expiresAt: new Date(expiresAt),
				});
			} else {
				ctx.context.logger.warn(
					"Could not extract assertion ID for replay protection",
					{ providerId: provider.providerId },
				);
			}

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

			const isTrustedProvider: boolean =
				!!ctx.context.options.account?.accountLinking?.trustedProviders?.includes(
					provider.providerId,
				) ||
				("domainVerified" in provider &&
					!!(provider as { domainVerified?: boolean }).domainVerified &&
					validateEmailDomain(userInfo.email as string, provider.domain));

			const safeCallbackUrl = getSafeRedirectUrl(
				relayState?.callbackURL || parsedSamlConfig.callbackUrl,
				currentCallbackPath,
				appOrigin,
				isTrusted,
			);

			const result = await handleOAuthUserInfo(ctx, {
				userInfo: {
					email: userInfo.email as string,
					name: (userInfo.name || userInfo.email) as string,
					id: userInfo.id as string,
					emailVerified: Boolean(userInfo.emailVerified),
				},
				account: {
					providerId: provider.providerId,
					accountId: userInfo.id as string,
					accessToken: "",
					refreshToken: "",
				},
				callbackURL: safeCallbackUrl,
				disableSignUp: options?.disableImplicitSignUp,
				isTrustedProvider,
			});

			if (result.error) {
				throw ctx.redirect(
					`${safeCallbackUrl}?error=${result.error.split(" ").join("_")}`,
				);
			}

			const { session, user } = result.data!;

			if (options?.provisionUser) {
				await options.provisionUser({
					user: user as User & Record<string, any>,
					userInfo,
					provider,
				});
			}

			await assignOrganizationFromProvider(ctx as any, {
				user,
				profile: {
					providerType: "saml",
					providerId: provider.providerId,
					accountId: userInfo.id as string,
					email: userInfo.email as string,
					emailVerified: Boolean(userInfo.emailVerified),
					rawAttributes: attributes,
				},
				provider,
				provisioningOptions: options?.organizationProvisioning,
			});

			await setSessionCookie(ctx, { session, user });
			throw ctx.redirect(safeCallbackUrl);
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
			method: "POST",
			body: acsEndpointBodySchema,
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
			const { SAMLResponse } = ctx.body;
			const { providerId } = ctx.params;
			const currentCallbackPath = `${ctx.context.baseURL}/sso/saml2/sp/acs/${providerId}`;
			const appOrigin = new URL(ctx.context.baseURL).origin;

			const maxResponseSize =
				options?.saml?.maxResponseSize ?? DEFAULT_MAX_SAML_RESPONSE_SIZE;
			if (new TextEncoder().encode(SAMLResponse).length > maxResponseSize) {
				throw new APIError("BAD_REQUEST", {
					message: `SAML response exceeds maximum allowed size (${maxResponseSize} bytes)`,
				});
			}
			let relayState: RelayState | null = null;
			if (ctx.body.RelayState) {
				try {
					relayState = await parseRelayState(ctx);
				} catch {
					relayState = null;
				}
			}

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
								value: providerId,
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

			const isTrusted = (
				url: string,
				settings?: { allowRelativePaths: boolean },
			) => ctx.context.isTrustedOrigin(url, settings);

			// Compute a safe error redirect URL once, reused by all error paths.
			// Prefers errorURL from relay state, falls back to callbackURL, then provider config, then baseURL.
			const safeErrorUrl = getSafeRedirectUrl(
				relayState?.errorURL ||
					relayState?.callbackURL ||
					parsedSamlConfig.callbackUrl,
				currentCallbackPath,
				appOrigin,
				isTrusted,
			);

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

			try {
				validateSingleAssertion(SAMLResponse);
			} catch (error) {
				if (error instanceof APIError) {
					const errorCode =
						error.body?.code === "SAML_MULTIPLE_ASSERTIONS"
							? "multiple_assertions"
							: "no_assertion";
					throw ctx.redirect(
						`${safeErrorUrl}?error=${errorCode}&error_description=${encodeURIComponent(error.message)}`,
					);
				}
				throw error;
			}

			// Parse and validate SAML response
			let parsedResponse: FlowResult;
			try {
				parsedResponse = await sp.parseLoginResponse(idp, "post", {
					body: {
						SAMLResponse,
						RelayState: ctx.body.RelayState || undefined,
					},
				});

				if (!parsedResponse?.extract) {
					throw new Error("Invalid SAML response structure");
				}
			} catch (error) {
				ctx.context.logger.error("SAML response validation failed", {
					error,
					decodedResponse: new TextDecoder().decode(
						base64.decode(SAMLResponse),
					),
				});
				throw new APIError("BAD_REQUEST", {
					message: "Invalid SAML response",
					details: error instanceof Error ? error.message : String(error),
				});
			}

			const { extract } = parsedResponse!;

			validateSAMLAlgorithms(parsedResponse, options?.saml?.algorithms);

			validateSAMLTimestamp((extract as any).conditions, {
				clockSkew: options?.saml?.clockSkew,
				requireTimestamps: options?.saml?.requireTimestamps,
				logger: ctx.context.logger,
			});

			const inResponseToAcs = (extract as any).inResponseTo as
				| string
				| undefined;
			const shouldValidateInResponseToAcs =
				options?.saml?.enableInResponseToValidation;

			if (shouldValidateInResponseToAcs) {
				const allowIdpInitiated = options?.saml?.allowIdpInitiated !== false;

				if (inResponseToAcs) {
					let storedRequest: AuthnRequestRecord | null = null;

					const verification =
						await ctx.context.internalAdapter.findVerificationValue(
							`${AUTHN_REQUEST_KEY_PREFIX}${inResponseToAcs}`,
						);
					if (verification) {
						try {
							storedRequest = JSON.parse(
								verification.value,
							) as AuthnRequestRecord;
							if (storedRequest && storedRequest.expiresAt < Date.now()) {
								storedRequest = null;
							}
						} catch {
							storedRequest = null;
						}
					}

					if (!storedRequest) {
						ctx.context.logger.error(
							"SAML InResponseTo validation failed: unknown or expired request ID",
							{ inResponseTo: inResponseToAcs, providerId },
						);
						throw ctx.redirect(
							`${safeErrorUrl}?error=invalid_saml_response&error_description=Unknown+or+expired+request+ID`,
						);
					}

					if (storedRequest.providerId !== providerId) {
						ctx.context.logger.error(
							"SAML InResponseTo validation failed: provider mismatch",
							{
								inResponseTo: inResponseToAcs,
								expectedProvider: storedRequest.providerId,
								actualProvider: providerId,
							},
						);
						await ctx.context.internalAdapter.deleteVerificationByIdentifier(
							`${AUTHN_REQUEST_KEY_PREFIX}${inResponseToAcs}`,
						);
						throw ctx.redirect(
							`${safeErrorUrl}?error=invalid_saml_response&error_description=Provider+mismatch`,
						);
					}

					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						`${AUTHN_REQUEST_KEY_PREFIX}${inResponseToAcs}`,
					);
				} else if (!allowIdpInitiated) {
					ctx.context.logger.error(
						"SAML IdP-initiated SSO rejected: InResponseTo missing and allowIdpInitiated is false",
						{ providerId },
					);
					throw ctx.redirect(
						`${safeErrorUrl}?error=unsolicited_response&error_description=IdP-initiated+SSO+not+allowed`,
					);
				}
			}

			// Assertion Replay Protection
			const samlContentAcs = new TextDecoder().decode(
				base64.decode(SAMLResponse),
			);
			const assertionIdAcs = extractAssertionId(samlContentAcs);

			if (assertionIdAcs) {
				const issuer = idp.entityMeta.getEntityID();
				const conditions = (extract as any).conditions as
					| SAMLConditions
					| undefined;
				const clockSkew = options?.saml?.clockSkew ?? DEFAULT_CLOCK_SKEW_MS;
				const expiresAt = conditions?.notOnOrAfter
					? new Date(conditions.notOnOrAfter).getTime() + clockSkew
					: Date.now() + DEFAULT_ASSERTION_TTL_MS;

				const existingAssertion =
					await ctx.context.internalAdapter.findVerificationValue(
						`${USED_ASSERTION_KEY_PREFIX}${assertionIdAcs}`,
					);

				let isReplay = false;
				if (existingAssertion) {
					try {
						const stored = JSON.parse(existingAssertion.value);
						if (stored.expiresAt >= Date.now()) {
							isReplay = true;
						}
					} catch (error) {
						ctx.context.logger.warn("Failed to parse stored assertion record", {
							assertionId: assertionIdAcs,
							error,
						});
					}
				}

				if (isReplay) {
					ctx.context.logger.error(
						"SAML assertion replay detected: assertion ID already used",
						{
							assertionId: assertionIdAcs,
							issuer,
							providerId,
						},
					);
					throw ctx.redirect(
						`${safeErrorUrl}?error=replay_detected&error_description=SAML+assertion+has+already+been+used`,
					);
				}

				await ctx.context.internalAdapter.createVerificationValue({
					identifier: `${USED_ASSERTION_KEY_PREFIX}${assertionIdAcs}`,
					value: JSON.stringify({
						assertionId: assertionIdAcs,
						issuer,
						providerId,
						usedAt: Date.now(),
						expiresAt,
					}),
					expiresAt: new Date(expiresAt),
				});
			} else {
				ctx.context.logger.warn(
					"Could not extract assertion ID for replay protection",
					{ providerId },
				);
			}

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

			const isTrustedProvider: boolean =
				!!ctx.context.options.account?.accountLinking?.trustedProviders?.includes(
					provider.providerId,
				) ||
				("domainVerified" in provider &&
					!!(provider as { domainVerified?: boolean }).domainVerified &&
					validateEmailDomain(userInfo.email as string, provider.domain));

			const safeCallbackUrl = getSafeRedirectUrl(
				relayState?.callbackURL || parsedSamlConfig.callbackUrl,
				currentCallbackPath,
				appOrigin,
				isTrusted,
			);

			const result = await handleOAuthUserInfo(ctx, {
				userInfo: {
					email: userInfo.email as string,
					name: (userInfo.name || userInfo.email) as string,
					id: userInfo.id as string,
					emailVerified: Boolean(userInfo.emailVerified),
				},
				account: {
					providerId: provider.providerId,
					accountId: userInfo.id as string,
					accessToken: "",
					refreshToken: "",
				},
				callbackURL: safeCallbackUrl,
				disableSignUp: options?.disableImplicitSignUp,
				isTrustedProvider,
			});

			if (result.error) {
				throw ctx.redirect(
					`${safeCallbackUrl}?error=${result.error.split(" ").join("_")}`,
				);
			}

			const { session, user } = result.data!;

			if (options?.provisionUser) {
				await options.provisionUser({
					user: user as User & Record<string, any>,
					userInfo,
					provider,
				});
			}

			await assignOrganizationFromProvider(ctx as any, {
				user,
				profile: {
					providerType: "saml",
					providerId: provider.providerId,
					accountId: userInfo.id as string,
					email: userInfo.email as string,
					emailVerified: Boolean(userInfo.emailVerified),
					rawAttributes: attributes,
				},
				provider,
				provisioningOptions: options?.organizationProvisioning,
			});

			await setSessionCookie(ctx, { session, user });
			throw ctx.redirect(safeCallbackUrl);
		},
	);
};
