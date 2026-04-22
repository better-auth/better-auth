import { base64Url } from "@better-auth/utils/base64";
import type { OAuth2Tokens } from "./oauth-provider";

export function getOAuth2Tokens(data: Record<string, any>): OAuth2Tokens {
	const getDate = (seconds: number) => {
		const now = new Date();
		return new Date(now.getTime() + seconds * 1000);
	};

	return {
		tokenType: data.token_type,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		accessTokenExpiresAt: data.expires_in
			? getDate(data.expires_in)
			: undefined,
		refreshTokenExpiresAt: data.refresh_token_expires_in
			? getDate(data.refresh_token_expires_in)
			: undefined,
		scopes: data?.scope
			? typeof data.scope === "string"
				? data.scope.split(" ")
				: data.scope
			: [],
		idToken: data.id_token,
		// Preserve the raw token response for provider-specific fields
		raw: data,
	};
}

/**
 * Pick the first usable Client ID from a provider config. Accepts either the
 * single-string form or the array form (used for cross-platform ID token
 * audience verification), and returns `undefined` when neither yields a
 * non-empty string.
 */
export function getPrimaryClientId(clientId: unknown): string | undefined {
	const value = Array.isArray(clientId) ? clientId[0] : clientId;
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function generateCodeChallenge(codeVerifier: string) {
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
}
