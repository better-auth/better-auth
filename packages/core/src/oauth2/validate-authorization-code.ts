import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { jwtVerify } from "jose";
import type { ProviderOptions } from "./index";
import { getOAuth2Tokens } from "./index";

export function createAuthorizationCodeRequest({
	code,
	codeVerifier,
	redirectURI,
	options,
	authentication,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: {
	code: string;
	redirectURI: string;
	options: Partial<ProviderOptions>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	authentication?: ("basic" | "post") | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}) {
	const body = new URLSearchParams();
	const requestHeaders: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
		...headers,
	};
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	options.clientKey && body.set("client_key", options.clientKey);
	deviceId && body.set("device_id", deviceId);
	body.set("redirect_uri", options.redirectURI || redirectURI);
	if (resource) {
		if (typeof resource === "string") {
			body.append("resource", resource);
		} else {
			for (const _resource of resource) {
				body.append("resource", _resource);
			}
		}
	}
	// Use standard Base64 encoding for HTTP Basic Auth (OAuth2 spec, RFC 7617)
	// Fixes compatibility with providers like Notion, Twitter, etc.
	if (authentication === "basic") {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		const encodedCredentials = base64.encode(
			`${primaryClientId}:${options.clientSecret ?? ""}`,
		);
		requestHeaders["authorization"] = `Basic ${encodedCredentials}`;
	} else {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
		if (options.clientSecret) {
			body.set("client_secret", options.clientSecret);
		}
	}

	for (const [key, value] of Object.entries(additionalParams)) {
		if (!body.has(key)) body.append(key, value);
	}

	return {
		body,
		headers: requestHeaders,
	};
}

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
	authentication,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: {
	code: string;
	redirectURI: string;
	options: Partial<ProviderOptions>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	tokenEndpoint: string;
	authentication?: ("basic" | "post") | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}) {
	const { body, headers: requestHeaders } = createAuthorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		authentication,
		deviceId,
		headers,
		additionalParams,
		resource,
	});

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
		},
	});
	if (error) {
		throw error;
	}
	const keys = data["keys"];
	const header = JSON.parse(atob(token.split(".")[0]!));
	const key = keys.find((key) => key.kid === header.kid);
	if (!key) {
		throw new Error("Key not found");
	}
	const verified = await jwtVerify(token, key);
	return verified;
}
