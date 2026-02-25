import type { AuthContext } from "@better-auth/core";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

/**
 * Check if a string looks like encrypted data
 */
function isLikelyEncrypted(token: string): boolean {
	return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}

export function decryptOAuthToken(token: string, ctx: AuthContext) {
	if (!token) return token;
	if (ctx.options.account?.encryptOAuthTokens) {
		if (!isLikelyEncrypted(token)) {
			return token;
		}
		return symmetricDecrypt({
			key: ctx.secret,
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
			key: ctx.secret,
			data: token,
		});
	}
	return token;
}
