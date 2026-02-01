import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
	base64url,
	calculateJwkThumbprint,
	decodeProtectedHeader,
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

const jwtDecryptOpts = {
	clockTolerance: 15,
	keyManagementAlgorithms: [alg],
	contentEncryptionAlgorithms: [enc, "A256GCM"],
};

export async function symmetricDecodeJWT<T = any>(
	token: string,
	secret: string | SecretConfig,
	salt: string,
): Promise<T | null> {
	if (!token) return null;
	// Parse the JWT header to check if kid is present
	let hasKid = false;
	try {
		const header = decodeProtectedHeader(token);
		hasKid = header.kid !== undefined;
	} catch {
		return null;
	}

	try {
		const secrets = getAllSecrets(secret);
		const { payload } = await jwtDecrypt(
			token,
			async (protectedHeader) => {
				const kid = protectedHeader.kid;
				if (kid !== undefined) {
					for (const s of secrets) {
						const encryptionSecret = deriveEncryptionSecret(s.value, salt);
						const thumbprint = await calculateJwkThumbprint(
							{ kty: "oct", k: base64url.encode(encryptionSecret) },
							"sha256",
						);
						if (kid === thumbprint) return encryptionSecret;
					}
					throw new Error("no matching decryption secret");
				}
				// kid is undefined — single secret: use it directly
				if (secrets.length === 1) {
					return deriveEncryptionSecret(secrets[0].value, salt);
				}
				// kid is undefined with multiple secrets: cannot determine
				// which key to use. Try the current (first) secret.
				return deriveEncryptionSecret(secrets[0].value, salt);
			},
			jwtDecryptOpts,
		);
		return payload as T;
	} catch {
		// Only try fallback if token has no kid
		if (hasKid) {
			return null;
		}
		// If kid was undefined and first secret failed, try remaining secrets
		const secrets = getAllSecrets(secret);
		if (secrets.length <= 1) return null;
		for (let i = 1; i < secrets.length; i++) {
			try {
				const encryptionSecret = deriveEncryptionSecret(
					secrets[i].value,
					salt,
				);
				const { payload } = await jwtDecrypt(
					token,
					encryptionSecret,
					jwtDecryptOpts,
				);
				return payload as T;
			} catch {
				continue;
			}
		}
		return null;
	}
}
