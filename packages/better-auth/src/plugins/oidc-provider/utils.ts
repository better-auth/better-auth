import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";

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
			if (!decoded.includes(":")) {
				return null;
			}
			const [id, secret] = decoded.split(":");
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
