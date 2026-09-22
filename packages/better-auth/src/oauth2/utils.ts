import type { AuthContext, LiteralString } from "@better-auth/core";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

/**
 * Check if a string looks like encrypted data
 */
export function isLikelyEncrypted(token: string): boolean {
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
 * Encrypt a token that is already stored in the account table.
 *
 * Only a value that does not look like ciphertext is encrypted, so a row
 * written before `encryptOAuthTokens` was turned on is upgraded in place.
 * A value that does look like ciphertext is returned untouched: decrypting it
 * here to check would throw under a rotated secret, and re-encrypting the
 * result would replace the stored token for good.
 */
export async function encryptStoredOAuthToken(
	token: string | null | undefined,
	ctx: AuthContext,
) {
	if (!token || isLikelyEncrypted(token)) return token;
	return setTokenUtil(token, ctx);
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
