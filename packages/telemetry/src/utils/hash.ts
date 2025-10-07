import { createHash } from "@better-auth/utils/hash";
import { base64 } from "@better-auth/utils/base64";

export async function hashToBase64(
	data: string | ArrayBuffer,
): Promise<string> {
	const buffer = await createHash("SHA-256").digest(data);
	return base64.encode(buffer);
}
