import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "crypto";

// Helper function to handle different key formats and lengths
function deriveKey(secretKey: string) {
	let keyBuffer: string | Buffer;

	if (Buffer.byteLength(secretKey, "utf8") === 32) {
		keyBuffer = Buffer.from(secretKey, "utf8"); // Key is already 32 bytes
	} else {
		keyBuffer = createHash("sha256").update(secretKey).digest(); // Hash to ensure 32 bytes
	}

	return keyBuffer;
}

// Encryption function using the provided secret as a key
export function encryptPrivateKey(privateKey: string, secretKey: string) {
	const key = deriveKey(secretKey); // Derive a 32-byte key from the provided secret

	const iv = randomBytes(12); // 12-byte IV for AES-GCM
	const cipher = createCipheriv("aes-256-gcm", key, iv);

	let ciphertext = cipher.update(privateKey, "utf8", "base64");
	ciphertext += cipher.final("base64");

	const authTag = cipher.getAuthTag(); // Get the authentication tag

	return {
		encryptedPrivateKey: ciphertext,
		iv: iv.toString("base64"),
		authTag: authTag.toString("base64"),
	};
}

// Decryption function using the same secret
export function decryptPrivateKey(
	encryptedPrivate: {
		encryptedPrivateKey: string;
		iv: string;
		authTag: string;
	},
	secretKey: string,
) {
	const key = deriveKey(secretKey); // Derive a 32-byte key from the provided secret

	const { encryptedPrivateKey, iv, authTag } = encryptedPrivate;

	const ivBuffer = Buffer.from(iv, "base64");
	const authTagBuffer = Buffer.from(authTag, "base64");

	const decipher = createDecipheriv("aes-256-gcm", key, ivBuffer);
	decipher.setAuthTag(authTagBuffer);

	let plaintext = decipher.update(encryptedPrivateKey, "base64", "utf8");
	plaintext += decipher.final("utf8");

	return plaintext;
}
