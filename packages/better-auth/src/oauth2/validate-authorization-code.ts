import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions } from "./types";
import { encodeBasicCredentials, getOAuth2Tokens } from "./utils";

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
	authType,
}: {
	code: string;
	redirectURI: string;
	options: ProviderOptions;
	codeVerifier?: string;
	tokenEndpoint: string;
	authType: "basic" | "body";
}) {
	const body = new URLSearchParams();
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	body.set("redirect_uri", redirectURI);

	if (authType === "body") {
		body.set("client_id", options.clientId);
		body.set("client_secret", options.clientSecret);
	}

	const { data, error } = await betterFetch<object>(tokenEndpoint, {
		method: "POST",
		body: body,
		headers: {
			"content-type": "application/x-www-form-urlencoded",
			accept: "application/json",
			"user-agent": "better-auth",
			...(authType === "basic" && {
				authorization: `Basic ${encodeBasicCredentials(
					options.clientId,
					options.clientSecret,
				)}`,
			}),
		},
	});
	if (error) {
		throw error;
	}
	const tokens = getOAuth2Tokens(data);
	return tokens;
}
