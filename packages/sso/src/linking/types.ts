export interface NormalizedSSOProfile {
	providerType: "saml" | "oidc";
	providerId: string;
	providerAccountId: string;
	email: string;
	emailVerified: boolean;
	name?: string;
	image?: string;
	rawAttributes?: Record<string, unknown>;
}
