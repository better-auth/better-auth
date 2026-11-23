// cspell:ignore cbor
import { createHash, webcrypto } from "node:crypto";

type CborValue = number | string | Uint8Array | Map<number | string, CborValue>;

function cborHeader(major: number, length: number) {
	if (length < 24) return [(major << 5) | length];
	if (length < 0x100) return [(major << 5) | 24, length];
	return [(major << 5) | 25, length >> 8, length & 0xff];
}

function encodeCbor(value: CborValue): number[] {
	if (typeof value === "number") {
		return value >= 0 ? cborHeader(0, value) : cborHeader(1, -1 - value);
	}
	if (typeof value === "string") {
		const bytes = new TextEncoder().encode(value);
		return [...cborHeader(3, bytes.length), ...bytes];
	}
	if (value instanceof Uint8Array) {
		return [...cborHeader(2, value.length), ...value];
	}
	const entries = [...value.entries()].flatMap(([key, entry]) => [
		...encodeCbor(key),
		...encodeCbor(entry),
	]);
	return [...cborHeader(5, value.size), ...entries];
}

function derInteger(bytes: Uint8Array) {
	let start = 0;
	while (start < bytes.length - 1 && bytes[start] === 0) start++;
	const body = bytes.subarray(start);
	const padded = body[0]! & 0x80 ? [0, ...body] : [...body];
	return [0x02, padded.length, ...padded];
}

function derSignature(raw: Uint8Array) {
	const r = derInteger(raw.subarray(0, 32));
	const s = derInteger(raw.subarray(32));
	return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

const toBase64Url = (bytes: Uint8Array | number[]) =>
	Buffer.from(bytes).toString("base64url");
const fromBase64Url = (value: string) =>
	new Uint8Array(Buffer.from(value, "base64url"));
const sha256 = (data: Uint8Array) =>
	new Uint8Array(createHash("sha256").update(data).digest());

const clientDataJSON = (type: string, challenge: string, origin: string) =>
	new TextEncoder().encode(
		JSON.stringify({ type, challenge, origin, crossOrigin: false }),
	);

/**
 * What the browser and authenticator report for one ceremony: the web origin
 * recorded in the client data, and whether the UV flag is set.
 */
export type CeremonyOptions = {
	origin: string;
	userVerified: boolean;
};

/**
 * A software authenticator for one credential under `rpID`. It produces
 * structurally valid `none` attestations and ES256 assertions (WebAuthn L3
 * 7.1 and 7.2), with a counter that increases on every assertion.
 */
export async function createAuthenticator(rpID: string) {
	const keyPair = await webcrypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	const jwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
	const credentialId = webcrypto.getRandomValues(new Uint8Array(16));
	const id = toBase64Url(credentialId);
	const rpIdHash = sha256(new TextEncoder().encode(rpID));
	const cosePublicKey = encodeCbor(
		new Map<number, CborValue>([
			[1, 2],
			[3, -7],
			[-1, 1],
			[-2, fromBase64Url(jwk.x!)],
			[-3, fromBase64Url(jwk.y!)],
		]),
	);
	let counter = 0;

	const register = (challenge: string, ceremony: CeremonyOptions) => {
		// UP (0x01) and AT (0x40) always set; UV (0x04) only when requested.
		const flags = 0x01 | 0x40 | (ceremony.userVerified ? 0x04 : 0x00);
		const authData = new Uint8Array([
			...rpIdHash,
			flags,
			0,
			0,
			0,
			0,
			...new Uint8Array(16),
			(credentialId.length >> 8) & 0xff,
			credentialId.length & 0xff,
			...credentialId,
			...cosePublicKey,
		]);
		const attestationObject = encodeCbor(
			new Map<string, CborValue>([
				["fmt", "none"],
				["attStmt", new Map()],
				["authData", authData],
			]),
		);
		return {
			id,
			rawId: id,
			type: "public-key" as const,
			response: {
				clientDataJSON: toBase64Url(
					clientDataJSON("webauthn.create", challenge, ceremony.origin),
				),
				attestationObject: toBase64Url(attestationObject),
				transports: ["internal"],
			},
			clientExtensionResults: {},
			authenticatorAttachment: "platform",
		};
	};

	const assert = async (challenge: string, ceremony: CeremonyOptions) => {
		counter += 1;
		const flags = 0x01 | (ceremony.userVerified ? 0x04 : 0x00);
		const authData = new Uint8Array([
			...rpIdHash,
			flags,
			(counter >>> 24) & 0xff,
			(counter >>> 16) & 0xff,
			(counter >>> 8) & 0xff,
			counter & 0xff,
		]);
		const clientData = clientDataJSON(
			"webauthn.get",
			challenge,
			ceremony.origin,
		);
		const signed = new Uint8Array([...authData, ...sha256(clientData)]);
		const rawSignature = new Uint8Array(
			await webcrypto.subtle.sign(
				{ name: "ECDSA", hash: "SHA-256" },
				keyPair.privateKey,
				signed,
			),
		);
		return {
			id,
			rawId: id,
			type: "public-key" as const,
			response: {
				clientDataJSON: toBase64Url(clientData),
				authenticatorData: toBase64Url(authData),
				signature: toBase64Url(derSignature(rawSignature)),
			},
			clientExtensionResults: {},
		};
	};

	return { register, assert };
}
