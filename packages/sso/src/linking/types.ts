export interface NormalizedSSOProfile {
	providerType: "saml" | "oidc";
	providerId: string;
	accountId: string;
	email: string;
	emailVerified: boolean;
	name?: string;
	image?: string;
	rawAttributes?: Record<string, unknown>;
}
