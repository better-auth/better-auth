import { type JWTPayload, SignJWT, decodeJwt, jwtVerify } from "jose";

export function parseJWT<T>(jwt: string) {
	const decoded = decodeJwt(jwt) as T & JWTPayload;
	return decoded;
}

export function validateJWT(jwt: string, secret: string) {
	return jwtVerify(jwt, new TextEncoder().encode(secret));
}

export function createJWT({
	payload,
	secret,
	expiresIn,
	algorithm,
}: {
	payload: Record<string, any>;
	secret: string;
	expiresIn: number;
	algorithm?: string;
}) {
	return new SignJWT(payload)
		.setProtectedHeader({
			alg: algorithm || "HS256",
		})
		.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
		.sign(new TextEncoder().encode(secret));
}
