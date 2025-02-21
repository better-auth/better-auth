import { constantTimeEqual } from "./buffer";
import { createHash } from "@better-auth/utils/hash";
import { base64 } from "@better-auth/utils/base64";

export async function hashToBase64(
	data: string | ArrayBuffer,
): Promise<string> {
	const buffer = await createHash("SHA-256").digest(data);
	return base64.encode(buffer);
}

export async function compareHash(
	data: string | ArrayBuffer,
	hash: string,
): Promise<boolean> {
	const buffer = await createHash("SHA-256").digest(
		typeof data === "string" ? new TextEncoder().encode(data) : data,
	);
	const hashBuffer = base64.decode(hash);
	return constantTimeEqual(buffer, hashBuffer);
}
