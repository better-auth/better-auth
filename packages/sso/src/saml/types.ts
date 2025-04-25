import type { User } from "better-auth";

export type SAMLConfig = {
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
};

export type SSOProvider = {
	id: string;
	issuer: string;
	samlConfig: SAMLConfig;
	userId: string;
	providerId: string;
	organizationId?: string;
};

export type SSOOptions = {
	binding?: "post" | "redirect";
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
};

export type SAMLAssertion = {
	nameID: string;
	sessionIndex?: string;
	attributes: Record<string, any>;
};

export type SAMLConfigType = {
	entryPoint: string;
	providerId: string;
	issuer: string;
	cert: string;
	callbackUrl: string;
	audience?: string;
	domain?: string;
	mapping?: {
		id?: string;
		email?: string;
		firstName?: string;
		lastName?: string;
		extraFields?: Record<string, string>;
	};
	idpMetadata?: {
		metadata: string;
		privateKey?: string;
		privateKeyPass?: string;
		isAssertionEncrypted?: boolean;
		encPrivateKey?: string;
		encPrivateKeyPass?: string;
	};
	spMetadata: {
		metadata: string;
		binding?: string;
		privateKey?: string;
		privateKeyPass?: string;
		isAssertionEncrypted?: boolean;
		encPrivateKey?: string;
		encPrivateKeyPass?: string;
	};
	wantAssertionsSigned?: boolean;
	signatureAlgorithm?: string;
	digestAlgorithm?: string;
	identifierFormat?: string;
	privateKey?: string;
	decryptionPvk?: string;
	additionalParams?: Record<string, string>;
};

export type SAMLSSOConfigType = {
	entryPoint: string;
	issuer: string;
	audience?: string;
	cert: string;
	loginUrl: string;
	callbackUrl: string;
	idp: {
		metadata: string;
		privateKey?: string;
		privateKeyPass?: string;
		isAssertionEncrypted?: boolean;
		encPrivateKey?: string;
		encPrivateKeyPass?: string;
	};
	sp: {
		metadata: string;
		privateKey: string;
		privateKeyPass?: string;
		isAssertionEncrypted: boolean;
		encPrivateKey?: string;
		encPrivateKeyPass?: string;
		mapping?: {
			id: string;
			email: string;
			name: string;
			extraFields?: Record<string, string>;
		};
	};
	wantAssertionsSigned?: boolean;
	signatureAlgorithm?: string;
	digestAlgorithm?: string;
	identifierFormat?: string;
	privateKey?: string;
	decryptionPvk?: string;
	additionalParams?: Record<string, string>;
};
