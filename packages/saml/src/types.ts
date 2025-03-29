import { type User } from "../../better-auth/src";
import { z } from "zod";

export interface SAMLConfig {
	entryPoint: string;
	issuer: string;
	cert: string;
	callbackUrl: string;
	wantAssertionsSigned?: boolean;
	signatureAlgorithm?: string;
	digestAlgorithm?: string;
	identifierFormat?: string;
	privateKey?: string;
	decryptionPvk?: string;
	additionalParams?: Record<string, string>;
}

export interface SSOProvider {
	id: string;
	issuer: string;
	samlConfig: SAMLConfig;
	userId: string;
	providerId: string;
	organizationId?: string;
}

export interface SSOOptions {
	provisionUser?: (data: {
		user: User & Record<string, any>;
		userInfo: Record<string, any>;
		token: SAMLAssertion;
		provider: SSOProvider;
	}) => Promise<void>;
	organizationProvisioning?: {
		disabled?: boolean;
		defaultRole?: "member" | "admin";
		getRole?: (data: {
			user: User & Record<string, any>;
			userInfo: Record<string, any>;
			token: SAMLAssertion;
			provider: SSOProvider;
		}) => Promise<"member" | "admin">;
	};
}

export interface SAMLAssertion {
	nameID: string;
	sessionIndex?: string;
	attributes: Record<string, any>;
}

export const SAMLConfigSchema = z.object({
	entryPoint: z.string(),
	providerId: z.string(),
	issuer: z.string(),
	cert: z.string(),
	callbackUrl: z.string(),

	idpMetadata: z.object({
		metadata: z.string(),
		privateKey: z.string().optional(),
		privateKeyPass: z.string().optional(),
		isAssertionEncrypted: z.boolean().optional(),
		encPrivateKey: z.string().optional(),
		encPrivateKeyPass: z.string().optional(),
	}),
	spMetadata: z.object({
		metadata: z.string(),
	  binding: z.string().optional(),
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
				name: z.string({
					description:
						"The field in the user info response that contains the name. Defaults to 'name'",
				}),
				extraFields: z.record(z.string()).optional(),
			})
			.optional(),
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
	additionalParams: z.record(z.string()).optional(),
});
export const SAMLSSOConfig = z.object({
	entryPoint: z.string(),
	issuer: z.string(),
	audience: z.string().optional(),
	cert: z.string(),
	loginUrl: z.string(),
	callbackUrl: z.string(),
	idp: z.object({
		metadata: z.string(),
		privateKey: z.string().optional(),
		privateKeyPass: z.string().optional(),
		isAssertionEncrypted: z.boolean().optional(),
		encPrivateKey: z.string().optional(),
		encPrivateKeyPass: z.string().optional(),
	}),
	sp: z.object({
		metadata: z.string(),
		privateKey: z.string(),
		privateKeyPass: z.string().optional(),
		isAssertionEncrypted: z.boolean(),
		encPrivateKey: z.string().optional(),
		encPrivateKeyPass: z.string().optional(),
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
				name: z.string({
					description:
						"The field in the user info response that contains the name. Defaults to 'name'",
				}),
				extraFields: z.record(z.string()).optional(),
			})
			.optional(),
	}),
	wantAssertionsSigned: z.boolean().optional(),
	signatureAlgorithm: z.string().optional(),
	digestAlgorithm: z.string().optional(),
	identifierFormat: z.string().optional(),
	privateKey: z.string().optional(),
	decryptionPvk: z.string().optional(),
	additionalParams: z.record(z.string()).optional(),
});
