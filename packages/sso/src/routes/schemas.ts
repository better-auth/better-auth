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

export function getSSOProviderAdditionalFieldsSchema(options?: SSOOptions) {
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
		.enum(["client_secret_post", "client_secret_basic", "private_key_jwt"])
		.optional(),
	privateKeyId: z.string().optional(),
	privateKeyAlgorithm: z.string().optional(),
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
	mapping: samlMappingSchema,
});

export const updateSSOProviderBodySchema = z.object({
	issuer: z.string().url().optional(),
	domain: z.string().optional(),
	oidcConfig: oidcConfigSchema.optional(),
	samlConfig: samlConfigSchema.optional(),
});
