import type { AwaitableFunction } from "../types";
import { appendQueryParams } from "../utils/url";
import type { ProviderOptions } from "./index";
import { generateCodeChallenge, getPrimaryClientId } from "./utils";

/**
 * Query-parameter names that are populated by the framework as part of the
 * authorization request and must not be overridden by caller-supplied
 * `additionalParams`. Overriding `state`, PKCE, or `redirect_uri` would
 * break the callback correlation and session pinning guarantees.
 */
export const RESERVED_AUTHORIZATION_PARAMS = [
	"state",
	"client_id",
	"redirect_uri",
	"response_type",
	"code_challenge",
	"code_challenge_method",
	"nonce",
	"scope",
] as const;

export const RESERVED_AUTHORIZATION_PARAMS_SET: ReadonlySet<string> = new Set(
	RESERVED_AUTHORIZATION_PARAMS,
);

/**
 * Removes the endpoint's query parameters that `params` replaces. The rest of
 * the query keeps its original text, because re-serializing it would change
 * its encoding, such as `%20` to `+`, and break providers that sign the query.
 */
function withoutQueryParams(endpoint: string, params: URLSearchParams) {
	const url = new URL(endpoint);
	const kept = url.search
		.slice(1)
		.split("&")
		.filter((pair) => {
			const [name] = new URLSearchParams(pair).keys();
			return pair && name !== undefined && !params.has(name);
		});
	url.search = kept.join("&");
	return url.href;
}

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
	nonce,
	hd,
	responseMode,
	additionalParams,
	scopeJoiner,
}: {
	id: string;
	options: AwaitableFunction<ProviderOptions>;
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
	nonce?: string | undefined;
	hd?: string | undefined;
	responseMode?: string | undefined;
	additionalParams?: Record<string, string> | undefined;
	scopeJoiner?: string | undefined;
}) {
	options = typeof options === "function" ? await options() : options;
	const params = new URLSearchParams();
	params.set("response_type", responseType || "code");
	const primaryClientId = getPrimaryClientId(options.clientId);
	if (!primaryClientId) {
		throw new Error("OAuth provider requires clientId");
	}
	params.set("client_id", primaryClientId);
	params.set("state", state);
	if (scopes?.length) {
		params.set("scope", scopes.join(scopeJoiner || " "));
	}
	params.set("redirect_uri", options.redirectURI || redirectURI);
	duration && params.set("duration", duration);
	display && params.set("display", display);
	loginHint && params.set("login_hint", loginHint);
	nonce && params.set("nonce", nonce);
	prompt && params.set("prompt", prompt);
	hd && params.set("hd", hd);
	accessType && params.set("access_type", accessType);
	responseMode && params.set("response_mode", responseMode);
	if (codeVerifier) {
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		params.set("code_challenge_method", "S256");
		params.set("code_challenge", codeChallenge);
	}
	if (claims) {
		const claimsObj = claims.reduce(
			(acc, claim) => {
				acc[claim] = null;
				return acc;
			},
			{} as Record<string, null>,
		);
		params.set(
			"claims",
			JSON.stringify({
				id_token: { email: null, email_verified: null, ...claimsObj },
			}),
		);
	}
	if (additionalParams) {
		for (const [key, value] of Object.entries(additionalParams)) {
			if (RESERVED_AUTHORIZATION_PARAMS_SET.has(key)) continue;
			params.set(key, value);
		}
	}
	return new URL(
		appendQueryParams(
			withoutQueryParams(
				options.authorizationEndpoint || authorizationEndpoint,
				params,
			),
			params,
		),
	);
}
