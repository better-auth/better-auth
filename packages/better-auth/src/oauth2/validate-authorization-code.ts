import { base64Url } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { jwtVerify } from "jose";
import type { ProviderOptions } from "./types";
import { getOAuth2Tokens } from "./utils";

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
	authentication,
	deviceId,
	headers,
}: {
	code: string;
	redirectURI: string;
	options: ProviderOptions;
	codeVerifier?: string;
	deviceId?: string;
	tokenEndpoint: string;
	authentication?: "basic" | "post";
	headers?: Record<string, string>;
}) {
	const body = new URLSearchParams();
	const requestHeaders: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
		"user-agent": "better-auth",
		...headers,
	};
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	options.clientKey && body.set("client_key", options.clientKey);
	deviceId && body.set("device_id", deviceId);
	body.set("redirect_uri", options.redirectURI || redirectURI);
	if (authentication === "basic") {
		const encodedCredentials = base64Url.encode(
			`${options.clientId}:${options.clientSecret}`,
		);
		requestHeaders["authorization"] = `Basic ${encodedCredentials}`;
	} else {
		body.set("client_id", options.clientId);
		body.set("client_secret", options.clientSecret);
	}
	const { data, error } = await betterFetch<object>(tokenEndpoint, {
		method: "POST",
		body: body,
		headers: requestHeaders,
	});

	if (error) {
		throw error;
	}
	const tokens = getOAuth2Tokens(data);
	return tokens;
}

export async function validateToken(token: string, jwksEndpoint: string) {
	const { data, error } = await betterFetch<{
		keys: {
			kid: string;
			kty: string;
			use: string;
			n: string;
			e: string;
			x5c: string[];
		}[];
	}>(jwksEndpoint, {
		method: "GET",
		headers: {
			accept: "application/json",
			"user-agent": "better-auth",
		},
	});
	if (error) {
		throw error;
	}
	const keys = data["keys"];
	const header = JSON.parse(atob(token.split(".")[0]));
	const key = keys.find((key) => key.kid === header.kid);
	if (!key) {
		throw new Error("Key not found");
	}
	const verified = await jwtVerify(token, key);
	return verified;
}
