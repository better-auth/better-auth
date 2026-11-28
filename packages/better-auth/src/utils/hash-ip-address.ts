import { createHMAC } from "@better-auth/utils/hmac";

export function hashIPAddress(
	ip: string,
	secret: string,
	purpose: "rate-limit" | "session",
) {
	return createHMAC("SHA-256", "hex").sign(
		secret,
		`better-auth:${purpose}:ip:${ip}`,
	);
}
