import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { symmetricDecrypt } from "../../crypto";

export type StoreClientSecretOption =
	| "plain"
	| "hashed"
	| "encrypted"
	| { hash: (secret: string) => Promise<string> }
	| {
			encrypt: (secret: string) => Promise<string>;
			decrypt: (encrypted: string) => Promise<string>;
	  };

/**
 * Default client secret hasher using SHA-256
 */
export const defaultClientSecretHasher = async (clientSecret: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(clientSecret),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

/**
 * Verify a stored client secret against a provided client secret.
 * Handles plain, hashed, and encrypted storage methods.
 */
export async function verifyClientSecret(
	storedSecret: string,
	providedSecret: string,
	storeMethod: StoreClientSecretOption,
	serverSecret: string,
): Promise<boolean> {
	if (storeMethod === "encrypted") {
		const decrypted = await symmetricDecrypt({
			key: serverSecret,
			data: storedSecret,
		});
		return decrypted === providedSecret;
	}
	if (storeMethod === "hashed") {
		const hashed = await defaultClientSecretHasher(providedSecret);
		return hashed === storedSecret;
	}
	if (typeof storeMethod === "object" && "hash" in storeMethod) {
		const hashed = await storeMethod.hash(providedSecret);
		return hashed === storedSecret;
	}
	if (typeof storeMethod === "object" && "decrypt" in storeMethod) {
		const decrypted = await storeMethod.decrypt(storedSecret);
		return decrypted === providedSecret;
	}
	// Plain text - use constant-time comparison
	if (storedSecret.length !== providedSecret.length) {
		return false;
	}
	let result = 0;
	for (let i = 0; i < storedSecret.length; i++) {
		result |= storedSecret.charCodeAt(i) ^ providedSecret.charCodeAt(i);
	}
	return result === 0;
}

/**
 * Parse client credentials from request body and/or Authorization header.
 * Supports client_secret_basic (HTTP Basic Auth) and client_secret_post (body params).
 */
export function parseClientCredentials(
	body: Record<string, unknown>,
	authorizationHeader: string | null,
): { clientId: string; clientSecret: string } | null {
	let clientId = body.client_id as string | undefined;
	let clientSecret = body.client_secret as string | undefined;

	// Try HTTP Basic Auth (client_secret_basic)
	if (authorizationHeader?.startsWith("Basic ") && !clientId && !clientSecret) {
		try {
			const encoded = authorizationHeader.replace("Basic ", "");
			const decoded = new TextDecoder().decode(base64.decode(encoded));
			// Per RFC 7617, password can contain colons - only split on first colon
			const colonIndex = decoded.indexOf(":");
			if (colonIndex === -1) {
				return null;
			}
			const id = decoded.substring(0, colonIndex);
			const secret = decoded.substring(colonIndex + 1);
			if (!id || !secret) {
				return null;
			}
			clientId = id;
			clientSecret = secret;
		} catch {
			return null;
		}
	}

	if (!clientId || !clientSecret) {
		return null;
	}

	return { clientId, clientSecret };
}
