import type { AuthContext, LiteralString } from "@better-auth/core";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

/**
 * Check if a string looks like encrypted data
 */
function isLikelyEncrypted(token: string): boolean {
	if (token.startsWith("$ba$")) return true;
	return token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token);
}

export function decryptOAuthToken<T extends string | null | undefined>(
	token: T,
	ctx: AuthContext,
) {
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
 * Encrypts the tokens of an account record when `account.encryptOAuthTokens` is on.
 *
 * @internal
 */
export async function encryptAccountTokens(
	tokens: {
		accessToken?: string | null | undefined;
		refreshToken?: string | null | undefined;
		idToken?: string | null | undefined;
	},
	ctx: AuthContext,
) {
	return {
		accessToken: await setTokenUtil(tokens.accessToken, ctx),
		refreshToken: await setTokenUtil(tokens.refreshToken, ctx),
		idToken: await setTokenUtil(tokens.idToken, ctx),
	};
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
