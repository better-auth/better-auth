import { sha256 } from "oslo/crypto";
import { getBaseURL } from "../utils/base-url";
import { base64url } from "oslo/encoding";
import type { OAuth2Tokens } from "./types";

export async function generateCodeChallenge(codeVerifier: string) {
	const codeChallengeBytes = await sha256(
		new TextEncoder().encode(codeVerifier),
	);
	return base64url.encode(new Uint8Array(codeChallengeBytes), {
		includePadding: false,
	});
}

export function getOAuth2Tokens(data: Record<string, any>): OAuth2Tokens {
	return {
		tokenType: data.token_type,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		accessTokenExpiresAt: data.expires_at
			? new Date((Date.now() + data.expires_in) * 1000)
			: undefined,
		scopes: data?.scope
			? typeof data.scope === "string"
				? data.scope.split(" ")
				: data.scope
			: [],
		idToken: data.id_token,
	};
}
