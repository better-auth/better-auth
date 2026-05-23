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
 * Return the provider's primary Client ID: the single string, or the entry at
 * array index 0 for the cross-platform form used by ID token audience
 * verification. Index 0 is the designated primary and pairs with
 * `clientSecret` for the authorization code flow; later array entries are
 * only used as additional accepted audiences. Returns `undefined` when the
 * primary value is missing or an empty string.
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
