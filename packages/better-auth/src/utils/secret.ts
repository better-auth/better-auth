import { MissingSecret } from "@better-auth/shared/error";

export const DEFAULT_SECRET = "better-auth-secret-key-123456789";
export const getSecret = (secret?: string) => {
	secret = secret || process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
	if (process.env.NODE_ENV === "production" && !secret) {
		throw new MissingSecret();
	}
	return secret || DEFAULT_SECRET;
};
