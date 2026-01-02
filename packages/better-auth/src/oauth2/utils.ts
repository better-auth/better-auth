import type { AuthContext } from "@better-auth/core";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

export function decryptOAuthToken(token: string, ctx: AuthContext) {
	if (!token) return token;
	if (ctx.options.account?.encryptOAuthTokens && token.startsWith('enc:')) {
		return symmetricDecrypt({
			key: ctx.secret,
			data: token.slice(4),
		});
	}
	return token;
}

export async function setTokenUtil(
	token: string | null | undefined,
	ctx: AuthContext,
) {
	if (ctx.options.account?.encryptOAuthTokens && token) {
		const encryptedToken = await symmetricEncrypt({
			key: ctx.secret,
			data: token,
		});
		return 'enc:' + encryptedToken
	}
	return token;
}
