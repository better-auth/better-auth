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
import type { SecretConfig } from "./index";

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
	} catch {
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

function deriveEncryptionSecret(secret: string, salt: string): Uint8Array {
	return hkdf(
		sha256,
		new TextEncoder().encode(secret),
		new TextEncoder().encode(salt),
		info,
		64,
	);
}

function getCurrentSecret(secret: string | SecretConfig): string {
	if (typeof secret === "string") return secret;
	const value = secret.keys.get(secret.currentVersion);
	if (!value) {
		throw new Error(
			`Secret version ${secret.currentVersion} not found in keys`,
		);
	}
	return value;
}

function getAllSecrets(
	secret: string | SecretConfig,
): Array<{ version: number; value: string }> {
	if (typeof secret === "string") return [{ version: 0, value: secret }];
	const result: Array<{ version: number; value: string }> = [];
	for (const [version, value] of secret.keys) {
		result.push({ version, value });
	}
	if (
		secret.legacySecret &&
		!result.some((s) => s.value === secret.legacySecret)
	) {
		result.push({ version: -1, value: secret.legacySecret });
	}
	return result;
}

export async function symmetricEncodeJWT<T extends Record<string, any>>(
	payload: T,
	secret: string | SecretConfig,
	salt: string,
	expiresIn: number = 3600,
): Promise<string> {
	const currentSecret = getCurrentSecret(secret);
	const encryptionSecret = deriveEncryptionSecret(currentSecret, salt);

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
	secret: string | SecretConfig,
	salt: string,
): Promise<T | null> {
	if (!token) return null;
	try {
		const secrets = getAllSecrets(secret);
		const { payload } = await jwtDecrypt(
			token,
			async ({ kid }) => {
				for (const s of secrets) {
					const encryptionSecret = deriveEncryptionSecret(s.value, salt);
					if (kid === undefined) return encryptionSecret;

					const thumbprint = await calculateJwkThumbprint(
						{ kty: "oct", k: base64url.encode(encryptionSecret) },
						"sha256",
					);
					if (kid === thumbprint) return encryptionSecret;
				}
				throw new Error("no matching decryption secret");
			},
			{
				clockTolerance: 15,
				keyManagementAlgorithms: [alg],
				contentEncryptionAlgorithms: [enc, "A256GCM"],
			},
		);
		return payload as T;
	} catch {
		return null;
	}
}
