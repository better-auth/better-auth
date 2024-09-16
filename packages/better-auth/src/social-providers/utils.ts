import { OAuth2Tokens } from "arctic";
import type { ProviderOptions } from ".";
import { getBaseURL } from "../utils/base-url";
import { betterFetch } from "@better-fetch/fetch";

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
	body.set("code_verifier", codeVerifier || "");
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
	console.log({ data, error, body });
	if (error) {
		throw error;
	}
	const tokens = new OAuth2Tokens(data);
	return tokens;
}
