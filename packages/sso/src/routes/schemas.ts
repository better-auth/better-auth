import z from "zod/v4";

const oidcMappingSchema = z
	.object({
		id: z.string().optional(),
		email: z.string().optional(),
		emailVerified: z.string().optional(),
		name: z.string().optional(),
		image: z.string().optional(),
		extraFields: z.record(z.string(), z.any()).optional(),
	})
	.optional();

const samlMappingSchema = z
	.object({
		id: z.string().optional(),
		email: z.string().optional(),
		emailVerified: z.string().optional(),
		name: z.string().optional(),
		firstName: z.string().optional(),
		lastName: z.string().optional(),
		extraFields: z.record(z.string(), z.any()).optional(),
	})
	.optional();

const oidcConfigSchema = z.object({
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	authorizationEndpoint: z.string().url().optional(),
	tokenEndpoint: z.string().url().optional(),
	userInfoEndpoint: z.string().url().optional(),
	tokenEndpointAuthentication: z
		.enum(["client_secret_post", "client_secret_basic"])
		.optional(),
	jwksEndpoint: z.string().url().optional(),
	discoveryEndpoint: z.string().url().optional(),
	scopes: z.array(z.string()).optional(),
	pkce: z.boolean().optional(),
	overrideUserInfo: z.boolean().optional(),
	mapping: oidcMappingSchema,
});

const samlConfigSchema = z.object({
	entryPoint: z.string().url().optional(),
	cert: z.string().optional(),
	callbackUrl: z.string().url().optional(),
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
	decryptionPvk: z.string().optional(),
	additionalParams: z.record(z.string(), z.any()).optional(),
	mapping: samlMappingSchema,
});

export const updateSSOProviderBodySchema = z.object({
	issuer: z.string().url().optional(),
	domain: z.string().optional(),
	oidcConfig: oidcConfigSchema.optional(),
	samlConfig: samlConfigSchema.optional(),
});
