import { subtle, getRandomValues } from "@better-auth/utils";
import { base64 } from "@better-auth/utils/base64";

/**
 *
 * Converts an expirationTime to ISO seconds expiration time (the format of JWT exp)
 *
 * @param expirationTime - see options.jwt.expirationTime
 * @param iat - the iat time to consolidate on
 * @returns
 */
export function toExpJWT(
	expirationTime: number | Date | string,
	iat: number,
): number {
	if (typeof expirationTime === "number") {
		return expirationTime;
	}

	if (expirationTime instanceof Date) {
		return Math.floor(expirationTime.getTime() / 1000);
	}

	const timeSpanRegex =
		/^(-)?\s*(\d+(?:\.\d+)?)\s*(second|seconds|sec|secs|s|minute|minutes|min|mins|m|hour|hours|hr|hrs|h|day|days|d|week|weeks|w|year|years|yr|yrs|y)\s*(ago|from now)?$/i;
	const match = expirationTime.trim().match(timeSpanRegex);

	if (!match) {
		throw new Error(`Invalid time span format: ${expirationTime}`);
	}

	const [, negativePrefix, valueStr, unitRaw, suffix] = match;
	const value = parseFloat(valueStr);
	const unit = unitRaw.toLowerCase();

	const unitSeconds: Record<string, number> = {
		s: 1,
		sec: 1,
		secs: 1,
		second: 1,
		seconds: 1,
		m: 60,
		min: 60,
		mins: 60,
		minute: 60,
		minutes: 60,
		h: 3600,
		hr: 3600,
		hrs: 3600,
		hour: 3600,
		hours: 3600,
		d: 86400,
		day: 86400,
		days: 86400,
		w: 604800,
		week: 604800,
		weeks: 604800,
		y: 31557600,
		yr: 31557600,
		yrs: 31557600,
		year: 31557600,
		years: 31557600, // 365.25 days
	};

	const seconds = unitSeconds[unit];
	if (!seconds) {
		throw new Error(`Unsupported unit: ${unit}`);
	}

	const totalSeconds = value * seconds;
	const isSubtraction = negativePrefix || suffix?.toLowerCase() === "ago";

	return Math.floor(isSubtraction ? iat - totalSeconds : iat + totalSeconds);
}

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
			iv: ivBuffer as BufferSource,
		},
		key,
		ciphertext as BufferSource,
	);

	const dec = new TextDecoder();
	return dec.decode(decrypted);
}
