import * as z from "zod/v4";

export const normalizedSSOProfileSchema = z.object({
	providerType: z.enum(["saml", "oidc"]),
	providerId: z.string(),
	accountId: z.string(),
	email: z.string().email(),
	emailVerified: z.boolean(),
	name: z.string().optional(),
	image: z.string().optional(),
	rawAttributes: z.record(z.string(), z.unknown()).optional(),
});

export type NormalizedSSOProfile = z.infer<typeof normalizedSSOProfileSchema>;

export interface SSOAccountData {
	providerId: string;
	accountId: string;
	accessToken?: string;
	refreshToken?: string;
	idToken?: string;
	accessTokenExpiresAt?: Date;
	refreshTokenExpiresAt?: Date;
	scope?: string;
}

