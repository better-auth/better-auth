import { base64Url } from "@better-auth/utils/base64";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { generateId } from "better-auth";

/** Create a fixed-size key that preserves tuple and connection boundaries. */
export function createScopedKey(parts: readonly string[]): string {
	return base64Url.encode(sha256(utf8ToBytes(JSON.stringify(parts))), {
		padding: false,
	});
}

/** Create the canonical lookup key for a connection-owned SCIM User externalId. */
export function createSCIMUserExternalIdKey(
	connectionId: string,
	externalId: string,
): string {
	return createScopedKey(["scim-user-external-id", connectionId, externalId]);
}

/** Create one unique, lexicographically stable classic-pagination key. */
export function createSCIMOrderKey(createdAt: Date): string {
	return `${createdAt.getTime().toString().padStart(15, "0")}:${generateId(16)}`;
}
