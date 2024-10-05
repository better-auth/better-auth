import { OAuth2Tokens } from "arctic";
import type { ProviderOptions } from ".";
import { getBaseURL } from "../utils/base-url";
import { betterFetch } from "@better-fetch/fetch";
import { sha256 } from "@noble/hashes/sha256";
import { base64url } from "oslo/encoding";

export function getRedirectURI(providerId: string, redirectURI?: string) {
	return redirectURI || `${getBaseURL()}/callback/${providerId}`;
}

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
}: {
	code: string;
	redirectURI: string;
	options: ProviderOptions;
	codeVerifier?: string;
	tokenEndpoint: string;
}) {
	const body = new URLSearchParams();
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	body.set("redirect_uri", redirectURI);
	body.set("client_id", options.clientId);
	body.set("client_secret", options.clientSecret);
	const { data, error } = await betterFetch<object>(tokenEndpoint, {
		method: "POST",
		body: body,
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			accept: "application/json",
			"user-agent": "better-auth",
		},
	});
	if (error) {
		throw error;
	}
	const tokens = new OAuth2Tokens(data);
	return tokens;
}

export function generateCodeChallenge(codeVerifier: string): string {
	const codeChallengeBytes = sha256(new TextEncoder().encode(codeVerifier));
	return base64url.encode(codeChallengeBytes, {
		includePadding: false,
	});
}

export function createAuthorizationURL(
	id: string,
	options: ProviderOptions,
	authorizationEndpoint: string,
	state: string,
	codeVerifier: string,
	scopes: string[],
): URL {
	const url = new URL(authorizationEndpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", options.clientId);
	url.searchParams.set("state", state);
	url.searchParams.set("scope", scopes.join(" "));
	url.searchParams.set(
		"redirect_uri",
		options.redirectURI || getRedirectURI(id),
	);
	const codeChallenge = generateCodeChallenge(codeVerifier);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("code_challenge", codeChallenge);
	return url;
}
