import type { OAuth2Tokens } from "./types";
import { getDate } from "../utils/date";
import { createHash } from "@better-auth/utils/hash";
import { base64Url } from "@better-auth/utils/base64";
import type { AuthContext } from "../types";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";

export async function generateCodeChallenge(codeVerifier: string) {
	const codeChallengeBytes = await createHash("SHA-256").digest(codeVerifier);
	return base64Url.encode(new Uint8Array(codeChallengeBytes), {
		padding: false,
	});
}

export function getOAuth2Tokens(data: Record<string, any>): OAuth2Tokens {
	return {
		tokenType: data.token_type,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		accessTokenExpiresAt: data.expires_in
			? getDate(data.expires_in, "sec")
			: undefined,
		refreshTokenExpiresAt: data.refresh_token_expires_in
			? getDate(data.refresh_token_expires_in, "sec")
			: undefined,
		scopes: data?.scope
			? typeof data.scope === "string"
				? data.scope.split(" ")
				: data.scope
			: [],
		idToken: data.id_token,
	};
}

export const encodeOAuthParameter = (value: string) =>
	encodeURIComponent(value).replace(/%20/g, "+");

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
