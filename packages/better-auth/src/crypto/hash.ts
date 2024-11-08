import { HMAC, sha256 } from "oslo/crypto";
import { constantTimeEqual } from "./buffer";

export async function hashToBase64(
	data: string | ArrayBuffer,
): Promise<string> {
	const buffer = await sha256(
		typeof data === "string" ? new TextEncoder().encode(data) : data,
	);
	return Buffer.from(buffer).toString("base64");
}

export async function compareHash(
	data: string | ArrayBuffer,
	hash: string,
): Promise<boolean> {
	const buffer = await sha256(
		typeof data === "string" ? new TextEncoder().encode(data) : data,
	);
	const hashBuffer = Buffer.from(hash, "base64");
	return constantTimeEqual(buffer, hashBuffer);
}

async function signValue({ value, secret }: { value: string; secret: string }) {
	const hmac = new HMAC("SHA-256");
	return hmac
		.sign(new TextEncoder().encode(secret), new TextEncoder().encode(value))
		.then((buffer) => Buffer.from(buffer).toString("base64"));
}

function verifyValue({
	value,
	signature,
	secret,
}: { value: string; signature: string; secret: string }) {
	const hmac = new HMAC("SHA-256");
	return hmac.verify(
		new TextEncoder().encode(secret),
		Buffer.from(signature, "base64"),
		new TextEncoder().encode(value),
	);
}

export const hmac = {
	sign: signValue,
	verify: verifyValue,
};
