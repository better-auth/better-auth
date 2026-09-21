import type { AuthContext, LiteralString } from "@better-auth/core";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

/**
 * Check if a string looks like encrypted data
 */
function isLikelyEncrypted(token: string): boolean {
	if (token.startsWith("$ba$")) return true;
	return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}

export function decryptOAuthToken(token: string, ctx: AuthContext) {
	if (!token) return token;
	if (ctx.options.account?.encryptOAuthTokens) {
		if (!isLikelyEncrypted(token)) {
			return token;
		}
		return symmetricDecrypt({
			key: ctx.secretConfig,
			data: token,
		});
	}
	return token;
}

export function setTokenUtil(
	token: string | null | undefined,
	ctx: AuthContext,
) {
	if (ctx.options.account?.encryptOAuthTokens && token) {
		return symmetricEncrypt({
			key: ctx.secretConfig,
			data: token,
		});
	}
	return token;
}

export function getOAuthCallbackPath(provider: {
	id: LiteralString;
	callbackPath?: string | undefined;
}) {
	if (!provider.callbackPath) {
		return `/callback/${provider.id}`;
	}
	return provider.callbackPath.startsWith("/")
		? provider.callbackPath
		: `/${provider.callbackPath}`;
}

/**
 * Encrypt a token that was read back from the account table.
 *
 * Rows written before `encryptOAuthTokens` was turned on hold plaintext, so
 * decrypting first normalizes both cases instead of double-encrypting the ones
 * that are already ciphertext.
 */
export async function reencryptOAuthToken(
	token: string | null | undefined,
	ctx: AuthContext,
) {
	if (!token) return token;
	let plaintext = token;
	try {
		plaintext = (await decryptOAuthToken(token, ctx)) ?? token;
	} catch {
		// isLikelyEncrypted only inspects the shape, so a plaintext token that
		// happens to look like ciphertext reaches here; keep it as plaintext.
	}
	return setTokenUtil(plaintext, ctx);
}
