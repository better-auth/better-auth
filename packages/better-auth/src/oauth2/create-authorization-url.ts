import type { ProviderOptions } from "./types";
import { generateCodeChallenge, getRedirectURI } from "./utils";

export async function createAuthorizationURL({
	id,
	options,
	authorizationEndpoint,
	state,
	codeVerifier,
	scopes,
	disablePkce,
}: {
	id: string;
	options: ProviderOptions;
	authorizationEndpoint: string;
	state: string;
	codeVerifier?: string;
	scopes: string[];
	disablePkce?: boolean;
}) {
	const url = new URL(authorizationEndpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", options.clientId);
	url.searchParams.set("state", state);
	url.searchParams.set("scope", scopes.join(" "));
	url.searchParams.set(
		"redirect_uri",
		options.redirectURI || getRedirectURI(id),
	);
	if (!disablePkce && codeVerifier) {
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("code_challenge", codeChallenge);
	}
	return url;
}
