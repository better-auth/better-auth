import { base64Url } from "@better-auth/utils/base64";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { generateId } from "better-auth";

export function createScopedKey(parts: readonly string[]): string {
	return base64Url.encode(sha256(utf8ToBytes(JSON.stringify(parts))), {
		padding: false,
	});
}

/** Create one unique, lexicographically stable classic-pagination key. */
export function createSCIMOrderKey(createdAt: Date): string {
	return `${createdAt.getTime().toString().padStart(15, "0")}:${generateId(16)}`;
}

export const getResourceURL = (path: string, baseURL: string) => {
	const normalizedBaseURL = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
	const normalizedPath = path.replace(/^\/+/, "");
	return new URL(normalizedPath, normalizedBaseURL).toString();
};
