import { sha256 } from "oslo/crypto";
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
