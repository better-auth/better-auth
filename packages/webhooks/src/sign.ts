import { getWebcryptoSubtle } from "@better-auth/utils";

const algorithm = { name: "HMAC" as const, hash: "SHA-256" as const };

export const WEBHOOK_SIGNATURE_HEADER = "x-better-auth-webhook-signature";
export const WEBHOOK_ID_HEADER = "x-better-auth-webhook-id";

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
	if (hex.length % 2 !== 0) return null;
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (Number.isNaN(byte)) return null;
		out[i] = byte;
	}
	return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i]! ^ b[i]!;
	}
	return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
	return getWebcryptoSubtle().importKey(
		"raw",
		new TextEncoder().encode(secret),
		algorithm,
		false,
		["sign"],
	);
}

/**
 * Computes the v1 hex signature for `timestampSeconds.rawBody` using HMAC-SHA256.
 */
export async function signWebhookPayload(
	secret: string,
	timestampSeconds: number,
	rawBody: string,
): Promise<string> {
	const signedContent = `${timestampSeconds}.${rawBody}`;
	const key = await importHmacKey(secret);
	const sig = await getWebcryptoSubtle().sign(
		algorithm.name,
		key,
		new TextEncoder().encode(signedContent),
	);
	return toHex(new Uint8Array(sig));
}

export function formatSignatureHeader(
	timestampSeconds: number,
	signatureHex: string,
): string {
	return `t=${timestampSeconds},v1=${signatureHex}`;
}

export function parseSignatureHeader(
	header: string,
): { timestampSeconds: number; signatureHex: string } | null {
	const parts = header.split(",").map((p) => p.trim());
	let timestampSeconds: number | undefined;
	let signatureHex: string | undefined;
	for (const part of parts) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const key = part.slice(0, eq);
		const value = part.slice(eq + 1);
		if (key === "t") {
			const n = Number.parseInt(value, 10);
			if (Number.isFinite(n)) timestampSeconds = n;
		} else if (key === "v1") {
			signatureHex = value;
		}
	}
	if (timestampSeconds === undefined || !signatureHex) return null;
	return { timestampSeconds, signatureHex };
}

/**
 * Verifies the `x-better-auth-webhook-signature` header for a raw request body.
 * Rejects signatures older than `maxAgeSeconds` (replay protection).
 */
export async function verifyWebhookSignature(options: {
	rawBody: string;
	signatureHeader: string | null | undefined;
	secret: string;
	/**
	 * @default 300
	 */
	maxAgeSeconds?: number | undefined;
}): Promise<boolean> {
	const { rawBody, signatureHeader, secret, maxAgeSeconds = 300 } = options;
	if (!signatureHeader) return false;
	const parsed = parseSignatureHeader(signatureHeader);
	if (!parsed) return false;
	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - parsed.timestampSeconds) > maxAgeSeconds) {
		return false;
	}
	const expected = await signWebhookPayload(
		secret,
		parsed.timestampSeconds,
		rawBody,
	);
	const expectedBytes = hexToBytes(expected);
	const receivedBytes = hexToBytes(parsed.signatureHex);
	if (!expectedBytes || !receivedBytes) return false;
	return timingSafeEqual(expectedBytes, receivedBytes);
}
