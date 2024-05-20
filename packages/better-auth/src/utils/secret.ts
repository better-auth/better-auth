import { MissingSecret } from "@better-auth/shared/error";

export const getSecret = (secret?: string) => {
	const defaultSecret = "better-auth-secret-key-123456789";
	if (process.env.NODE_ENV === "production" && !secret) {
		throw new MissingSecret();
	}
	return secret || defaultSecret;
};
