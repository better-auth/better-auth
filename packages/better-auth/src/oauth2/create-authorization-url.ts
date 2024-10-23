import type { ProviderOptions } from "./types";
import { generateCodeChallenge } from "./utils";

export async function createAuthorizationURL({
	id,
	options,
	authorizationEndpoint,
	state,
	codeVerifier,
	scopes,
	claims,
	disablePkce,
	redirectURI,
}: {
	id: string;
	options: ProviderOptions;
	redirectURI: string;
	authorizationEndpoint: string;
	state: string;
	codeVerifier?: string;
	scopes: string[];
	disablePkce?: boolean;
	claims?: string[];
}) {
	const url = new URL(authorizationEndpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", options.clientId);
	url.searchParams.set("state", state);
	url.searchParams.set("scope", scopes.join(" "));
	url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);

	if (!disablePkce && codeVerifier) {
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("code_challenge", codeChallenge);
	}
	if (claims) {
		const claimsObj = claims.reduce(
			(acc, claim) => {
				acc[claim] = null;
				return acc;
			},
			{} as Record<string, null>,
		);
		url.searchParams.set(
			"claims",
			JSON.stringify({
				id_token: { email: null, email_verified: null, ...claimsObj },
			}),
		);
	}
	return url;
}
