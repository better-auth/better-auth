import type { User } from "better-auth";

export interface SAMLConfig {
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
}

export interface SAMLUserInfo {
	id: string;
	email: string;
	name?: string;
	attributes: Record<string, any>;
}

export interface SAMLSSOOptions {
	/**
	 * A custom function to provision a user when they sign in with SAML.
	 * This allows you to customize how users are created or updated in your system.
	 */
	provisionUser?: (userInfo: SAMLUserInfo) => Promise<User>;

	/**
	 * Options for provisioning users to an organization.
	 */
	organizationProvisioning?: {
		/**
		 * Whether to enable organization provisioning.
		 * If true, users will be automatically added to organizations based on their SAML attributes.
		 */
		enabled: boolean;

		/**
		 * A function to determine which organization a user should be added to.
		 * Returns the organization ID or null if the user shouldn't be added to any organization.
		 */
		getOrganizationId: (userInfo: SAMLUserInfo) => Promise<string | null>;

		/**
		 * The role to assign to users when they are added to an organization.
		 * @default "member"
		 */
		defaultRole?: string;
	};
}

export type SSOProvider = {
	id: string;
	issuer: string;
	samlConfig: SAMLConfig;
	userId: string;
	providerId: string;
	organizationId?: string;
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
