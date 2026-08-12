import type { AuthContext } from "@better-auth/core";
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
	return setTokenUtil(await decryptOAuthToken(token, ctx), ctx);
}
