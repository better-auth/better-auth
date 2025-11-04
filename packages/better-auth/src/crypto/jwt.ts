import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
	base64url,
	calculateJwkThumbprint,
	EncryptJWT,
	jwtDecrypt,
	jwtVerify,
	SignJWT,
} from "jose";

export async function signJWT(
	payload: any,
	secret: string,
	expiresIn: number = 3600,
): Promise<string> {
	const jwt = await new SignJWT(payload)
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
		.sign(new TextEncoder().encode(secret));

	return jwt;
}

export async function verifyJWT<T = any>(
	token: string,
	secret: string,
): Promise<T | null> {
	try {
		const verified = await jwtVerify(token, new TextEncoder().encode(secret));
		return verified.payload as T;
	} catch (error) {
		return null;
	}
}

// "BetterAuth.js Generated Encryption Key"
const info: Uint8Array = new Uint8Array([
	66, 101, 116, 116, 101, 114, 65, 117, 116, 104, 46, 106, 115, 32, 71, 101,
	110, 101, 114, 97, 116, 101, 100, 32, 69, 110, 99, 114, 121, 112, 116, 105,
	111, 110, 32, 75, 101, 121,
]);

const now = () => (Date.now() / 1000) | 0;

const alg = "dir";
const enc = "A256CBC-HS512"; // 64 bytes key

export async function symmetricEncodeJWT<T extends Record<string, any>>(
	payload: T,
	secret: string,
	salt: string,
	expiresIn: number = 3600,
): Promise<string> {
	const encryptionSecret = hkdf(
		sha256,
		new TextEncoder().encode(secret),
		new TextEncoder().encode(salt),
		info,
		64,
	);

	const thumbprint = await calculateJwkThumbprint(
		{ kty: "oct", k: base64url.encode(encryptionSecret) },
		"sha256",
	);

	return await new EncryptJWT(payload)
		.setProtectedHeader({ alg, enc, kid: thumbprint })
		.setIssuedAt()
		.setExpirationTime(now() + expiresIn)
		.setJti(crypto.randomUUID())
		.encrypt(encryptionSecret);
}

export async function symmetricDecodeJWT<T = any>(
	token: string,
	secret: string,
	salt: string,
): Promise<T | null> {
	if (!token) return null;
	try {
		const { payload } = await jwtDecrypt(
			token,
			async ({ kid }) => {
				const encryptionSecret = hkdf(
					sha256,
					new TextEncoder().encode(secret),
					new TextEncoder().encode(salt),
					info,
					64,
				);
				if (kid === undefined) return encryptionSecret;

				const thumbprint = await calculateJwkThumbprint(
					{ kty: "oct", k: base64url.encode(encryptionSecret) },
					"sha256",
				);
				if (kid === thumbprint) return encryptionSecret;

				throw new Error("no matching decryption secret");
			},
			{
				clockTolerance: 15,
				keyManagementAlgorithms: [alg],
				contentEncryptionAlgorithms: [enc, "A256GCM"],
			},
		);
		return payload as T;
	} catch (error) {
		return null;
	}
}
