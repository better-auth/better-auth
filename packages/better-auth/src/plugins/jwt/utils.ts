import { subtle, getRandomValues } from "@better-auth/utils";
import { base64 } from "@better-auth/utils/base64";

async function deriveKey(secretKey: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(secretKey),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);

	return subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: enc.encode("encryption_salt"),
			iterations: 100000,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export async function encryptPrivateKey(
	privateKey: string,
	secretKey: string,
): Promise<{ encryptedPrivateKey: string; iv: string; authTag: string }> {
	const key = await deriveKey(secretKey); // Derive a 32-byte key from the provided secret
	const iv = getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

	const enc = new TextEncoder();
	const ciphertext = await subtle.encrypt(
		{
			name: "AES-GCM",
			iv: iv,
		},
		key,
		enc.encode(privateKey),
	);

	const encryptedPrivateKey = base64.encode(ciphertext);
	const ivBase64 = base64.encode(iv);

	return {
		encryptedPrivateKey,
		iv: ivBase64,
		authTag: encryptedPrivateKey.slice(-16),
	};
}

export async function decryptPrivateKey(
	encryptedPrivate: {
		encryptedPrivateKey: string;
		iv: string;
		authTag: string;
	},
	secretKey: string,
): Promise<string> {
	const key = await deriveKey(secretKey);
	const { encryptedPrivateKey, iv } = encryptedPrivate;

	const ivBuffer = base64.decode(iv);
	const ciphertext = base64.decode(encryptedPrivateKey);

	const decrypted = await subtle.decrypt(
		{
			name: "AES-GCM",
			iv: ivBuffer,
		},
		key,
		ciphertext,
	);

	const dec = new TextDecoder();
	return dec.decode(decrypted);
}
