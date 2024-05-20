import { MissingSecret } from "@better-auth/shared/error";

export const getSecret = (secret?: string) => {
	secret = secret || process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
	const defaultSecret = "better-auth-secret-key-123456789";
	if (process.env.NODE_ENV === "production" && !secret) {
		throw new MissingSecret();
	}
	return secret || defaultSecret;
};
