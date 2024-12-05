import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions } from "./types";
import { getOAuth2Tokens } from "./utils";

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
	authentication,
}: {
	code: string;
	redirectURI: string;
	options: ProviderOptions;
	codeVerifier?: string;
	tokenEndpoint: string;
	authentication?: "basic" | "none";
}) {
	const body = new URLSearchParams();
	const headers: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
		"user-agent": "better-auth",
		// to override if `compress` is set to `false`
		"accept-encoding": "gzip,deflate",
	};
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	body.set("redirect_uri", redirectURI);
	if (authentication === "basic") {
		const encodedCredentials = btoa(
			`${options.clientId}:${options.clientSecret}`,
		);
		headers["authorization"] = `Basic ${encodedCredentials}`;
	} else {
		body.set("client_id", options.clientId);
		body.set("client_secret", options.clientSecret);
	}
	const { data, error } = await betterFetch<object>(tokenEndpoint, {
		method: "POST",
		body: body,
		headers,
	});
	if (error) {
		throw error;
	}
	const tokens = getOAuth2Tokens(data);
	return tokens;
}
