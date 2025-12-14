import type { AuthContext } from "@better-auth/core";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

export function decryptOAuthToken(token: string, ctx: AuthContext) {
	if (!token) return token;
	if (ctx.options.account?.encryptOAuthTokens) {
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
