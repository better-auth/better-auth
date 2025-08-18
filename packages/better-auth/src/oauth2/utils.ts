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

/**
 * Filters out sensitive fields from OAuth response data before storing in the raw field.
 * This helps prevent accidental exposure of client secrets or internal provider metadata.
 */
export function filterSensitiveFields(data: Record<string, any>): Record<string, any> {
	const sensitiveFields = [
		'client_secret',
		'client_assertion',
		'assertion',
		'private_key',
		'password',
		'secret',
		// Common internal fields that shouldn't be exposed
		'_internal',
		'_private',
		'__meta',
		// Some providers may include these
		'device_secret',
		'app_secret',
	];

	const filtered: Record<string, any> = {};
	
	for (const [key, value] of Object.entries(data)) {
		const lowerKey = key.toLowerCase();
		const isSensitive = sensitiveFields.some(field => 
			lowerKey.includes(field.toLowerCase())
		);
		
		if (!isSensitive) {
			filtered[key] = value;
		}
	}
	
	return filtered;
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
		raw: filterSensitiveFields(data),
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
