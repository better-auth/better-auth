import type { DBFieldAttribute } from "@better-auth/core/db";
import { APIError } from "better-auth/api";
import { parseInputData, toZodSchema } from "better-auth/db";
import * as z from "zod";
import type { SSOOptions } from "../types";

function getSSOProviderAdditionalFields(options?: SSOOptions) {
	return (options?.schema?.ssoProvider?.additionalFields ?? {}) as Record<
		string,
		DBFieldAttribute
	>;
}

function getSSOProviderAdditionalFieldsSchema(options?: SSOOptions) {
	const additionalFields = getSSOProviderAdditionalFields(options);
	const schema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});
	const blockedInputFields: Record<string, z.ZodOptional<z.ZodAny>> = {};
	for (const key in additionalFields) {
		if (additionalFields[key]?.input === false) {
			blockedInputFields[key] = z.any().optional();
		}
	}
	return schema.extend(blockedInputFields);
}

function assertNoBlockedAdditionalFieldInput(
	fields: Record<string, DBFieldAttribute>,
	data: Record<string, unknown>,
) {
	for (const key in fields) {
		if (fields[key]?.input === false && key in data) {
			throw new APIError("BAD_REQUEST", {
				message: `${key} is not allowed to be set`,
			});
		}
	}
}

export function parseSSOProviderAdditionalFields(
	options: SSOOptions | undefined,
	data: Record<string, unknown>,
	action: "create" | "update",
) {
	const fields = getSSOProviderAdditionalFields(options);
	assertNoBlockedAdditionalFieldInput(fields, data);
	return parseInputData(data, {
		fields,
		action,
	});
}

const oidcMappingSchema = z
	.object({
		id: z.string().meta({
			description: "Field mapping for user ID (defaults to 'sub')",
		}),
		email: z.string().meta({
			description: "Field mapping for email (defaults to 'email')",
		}),
		emailVerified: z
			.string()
			.meta({
				description:
					"Field mapping for email verification (defaults to 'email_verified')",
			})
			.optional(),
		name: z.string().meta({
			description: "Field mapping for name (defaults to 'name')",
		}),
		image: z
			.string()
			.meta({
				description: "Field mapping for image (defaults to 'picture')",
			})
			.optional(),
		extraFields: z.record(z.string(), z.any()).optional(),
	})
	.optional();

const samlMappingSchema = z
	.object({
		id: z.string().meta({
			description: "Field mapping for user ID (defaults to 'nameID')",
		}),
		email: z.string().meta({
			description: "Field mapping for email (defaults to 'email')",
		}),
		emailVerified: z
			.string()
			.meta({ description: "Field mapping for email verification" })
			.optional(),
		name: z.string().meta({
			description: "Field mapping for name (defaults to 'displayName')",
		}),
		firstName: z
			.string()
			.meta({
				description: "Field mapping for first name (defaults to 'givenName')",
			})
			.optional(),
		lastName: z
			.string()
			.meta({
				description: "Field mapping for last name (defaults to 'surname')",
			})
			.optional(),
		extraFields: z.record(z.string(), z.any()).optional(),
	})
	.optional();

const signingCertSchema = z
	.union([z.string(), z.array(z.string()).nonempty()])
	.meta({
		description:
			"IdP signing certificate(s). Pass a single PEM string or an array for rolling rotation.",
	});

const oidcConfigSchema = z.object({
	clientId: z.string().meta({ description: "The client ID" }),
	clientSecret: z
		.string()
		.meta({
			description:
				"The client secret. Required for client_secret_basic/client_secret_post. Optional for private_key_jwt.",
		})
		.optional(),
	authorizationEndpoint: z
		.string()
		.url()
		.meta({ description: "The authorization endpoint" })
		.optional(),
	tokenEndpoint: z
		.string()
		.url()
		.meta({ description: "The token endpoint" })
		.optional(),
	userInfoEndpoint: z
		.string()
		.url()
		.meta({ description: "The user info endpoint" })
		.optional(),
	tokenEndpointAuthentication: z
		.enum(["client_secret_post", "client_secret_basic", "private_key_jwt"])
		.optional(),
	privateKeyId: z.string().optional(),
	privateKeyAlgorithm: z.string().optional(),
	jwksEndpoint: z
		.string()
		.url()
		.meta({ description: "The JWKS endpoint" })
		.optional(),
	discoveryEndpoint: z.string().url().optional(),
	skipDiscovery: z
		.boolean()
		.meta({
			description:
				"Skip OIDC discovery during registration. When true, you must provide authorizationEndpoint, tokenEndpoint, and jwksEndpoint manually.",
		})
		.optional(),
	scopes: z
		.array(z.string())
		.meta({
			description:
				"The scopes to request. Defaults to ['openid', 'email', 'profile', 'offline_access']",
		})
		.optional(),
	pkce: z
		.boolean()
		.meta({ description: "Whether to use PKCE for the authorization flow" })
		.default(true)
		.optional(),
	overrideUserInfo: z.boolean().optional(),
	mapping: oidcMappingSchema,
});

const samlConfigSchema = z.object({
	entryPoint: z
		.string()
		.url()
		.meta({ description: "The IdP SSO URL (entry point)" }),
	cert: signingCertSchema
		.meta({
			description:
				"IdP signing certificate(s). Pass a single PEM string or an array for rolling rotation. Omit when `idpMetadata.metadata` XML carries the certs. When both this and `idpMetadata.cert` are set, `idpMetadata.cert` wins.",
		})
		.optional(),
	audience: z.string().optional(),
	callbackUrl: z.string().optional(),
	idpMetadata: z
		.object({
			metadata: z.string().optional(),
			entityID: z.string().optional(),
			cert: signingCertSchema
				.meta({
					description:
						"IdP signing certificate(s). Pass a single PEM string or an array for rolling rotation. Takes precedence over the top-level `cert`.",
				})
				.optional(),
			privateKey: z.string().optional(),
			privateKeyPass: z.string().optional(),
			isAssertionEncrypted: z.boolean().optional(),
			encPrivateKey: z.string().optional(),
			encPrivateKeyPass: z.string().optional(),
			singleSignOnService: z
				.array(
					z.object({
						Binding: z
							.string()
							.meta({ description: "The binding type for the SSO service" }),
						Location: z
							.string()
							.url()
							.meta({ description: "The URL for the SSO service" }),
					}),
				)
				.meta({ description: "Single Sign-On service configuration" })
				.optional(),
			singleLogoutService: z
				.array(
					z.object({
						Binding: z.string(),
						Location: z.string().url(),
					}),
				)
				.optional(),
		})
		.optional(),
	spMetadata: z
		.object({
			metadata: z.string().optional(),
			entityID: z.string().optional(),
			binding: z.string().optional(),
			privateKey: z.string().optional(),
			privateKeyPass: z.string().optional(),
			isAssertionEncrypted: z.boolean().optional(),
			encPrivateKey: z.string().optional(),
			encPrivateKeyPass: z.string().optional(),
		})
		.optional(),
	wantAssertionsSigned: z.boolean().optional(),
	authnRequestsSigned: z.boolean().optional(),
	signatureAlgorithm: z.string().optional(),
	digestAlgorithm: z.string().optional(),
	identifierFormat: z.string().optional(),
	privateKey: z.string().optional(),
	mapping: samlMappingSchema,
});

const registerSSOProviderBodySchema = z.object({
	providerId: z.string().meta({
		description:
			"The ID of the provider. This is used to identify the provider during login and callback",
	}),
	issuer: z
		.string()
		.url()
		.meta({ description: "The issuer URL of the provider" }),
	domain: z.string().meta({
		description:
			"The domain(s) of the provider. For enterprise multi-domain SSO where a single IdP serves multiple email domains, use comma-separated values (e.g., 'company.com,subsidiary.com,acquired-company.com')",
	}),
	oidcConfig: oidcConfigSchema.optional(),
	samlConfig: samlConfigSchema.optional(),
	organizationId: z
		.string()
		.meta({
			description:
				"If organization plugin is enabled, the organization id to link the provider to",
		})
		.optional(),
	overrideUserInfo: z
		.boolean()
		.meta({
			description:
				"Override user info with the provider info. Defaults to false",
		})
		.default(false)
		.optional(),
});

export function getRegisterSSOProviderBodySchema(options?: SSOOptions) {
	return registerSSOProviderBodySchema.extend({
		...getSSOProviderAdditionalFieldsSchema(options).shape,
	});
}

const updateSSOProviderBodySchema = z.object({
	issuer: z.string().url().optional(),
	domain: z.string().optional(),
	oidcConfig: oidcConfigSchema.partial().optional(),
	samlConfig: samlConfigSchema.partial().optional(),
});

export function getUpdateSSOProviderBodySchema(options?: SSOOptions) {
	return updateSSOProviderBodySchema.extend({
		providerId: z.string(),
		...getSSOProviderAdditionalFieldsSchema(options).partial().shape,
	});
}
