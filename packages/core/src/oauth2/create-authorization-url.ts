import type { ProviderOptions } from "./index";
import { generateCodeChallenge } from "./utils";

export async function createAuthorizationURL({
	id,
	options,
	authorizationEndpoint,
	state,
	codeVerifier,
	scopes,
	claims,
	redirectURI,
	duration,
	prompt,
	accessType,
	responseType,
	display,
	loginHint,
	hd,
	responseMode,
	additionalParams,
	scopeJoiner,
}: {
	id: string;
	options: ProviderOptions;
	redirectURI: string;
	authorizationEndpoint: string;
	state: string;
	codeVerifier?: string | undefined;
	scopes?: string[] | undefined;
	claims?: string[] | undefined;
	duration?: string | undefined;
	prompt?: string | undefined;
	accessType?: string | undefined;
	responseType?: string | undefined;
	display?: string | undefined;
	loginHint?: string | undefined;
	hd?: string | undefined;
	responseMode?: string | undefined;
	additionalParams?: Record<string, string> | undefined;
	scopeJoiner?: string | undefined;
}) {
	const url = new URL(authorizationEndpoint);
	url.searchParams.set("response_type", responseType || "code");
	const primaryClientId = Array.isArray(options.clientId)
		? options.clientId[0]
		: options.clientId;
	url.searchParams.set("client_id", primaryClientId);
	url.searchParams.set("state", state);
	if (scopes) {
		url.searchParams.set("scope", scopes.join(scopeJoiner || " "));
	}
	url.searchParams.set("redirect_uri", options.redirectURI || redirectURI);
	duration && url.searchParams.set("duration", duration);
	display && url.searchParams.set("display", display);
	loginHint && url.searchParams.set("login_hint", loginHint);
	prompt && url.searchParams.set("prompt", prompt);
	hd && url.searchParams.set("hd", hd);
	accessType && url.searchParams.set("access_type", accessType);
	responseMode && url.searchParams.set("response_mode", responseMode);
	if (codeVerifier) {
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
	if (additionalParams) {
		Object.entries(additionalParams).forEach(([key, value]) => {
			url.searchParams.set(key, value);
		});
	}
	return url;
}
