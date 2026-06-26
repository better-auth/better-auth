import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import type { AwaitableFunction } from "../types";
import type { ProviderOptions } from "./index";
import { getOAuth2Tokens } from "./index";
import {
	assertResponseNotRedirect,
	fetchRefusingRedirects,
	NO_FOLLOW_REDIRECT,
} from "./reject-redirects";
import type {
	TokenEndpointAuth,
	TokenEndpointSecretAuthentication,
} from "./token-endpoint-auth";
import { applyTokenEndpointAuth } from "./token-endpoint-auth";

interface AuthorizationCodeRequestInput {
	code: string;
	redirectURI: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	authentication?: TokenEndpointSecretAuthentication | undefined;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	tokenEndpoint?: string | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}

interface AuthorizationCodeRequestBaseInput {
	code: string;
	redirectURI: string;
	options: Partial<ProviderOptions>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}

interface ValidateAuthorizationCodeInput extends AuthorizationCodeRequestInput {
	tokenEndpoint: string;
}

export async function authorizationCodeRequest({
	code,
	codeVerifier,
	redirectURI,
	options,
	authentication,
	tokenEndpointAuth,
	tokenEndpoint,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: AuthorizationCodeRequestInput) {
	options = typeof options === "function" ? await options() : options;
	const request = buildAuthorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		deviceId,
		headers,
		additionalParams,
		resource,
	});

	await applyTokenEndpointAuth({
		body: request.body,
		headers: request.headers,
		options,
		tokenEndpoint: tokenEndpoint ?? "",
		grantType: "authorization_code",
		tokenEndpointAuth,
		authentication,
	});

	return request;
}

function buildAuthorizationCodeRequest({
	code,
	codeVerifier,
	redirectURI,
	options,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: AuthorizationCodeRequestBaseInput) {
	const body = new URLSearchParams();
	const requestHeaders: Record<string, string> = {
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
	tokenEndpointAuth,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: ValidateAuthorizationCodeInput) {
	const { body, headers: requestHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		authentication,
		tokenEndpointAuth,
		tokenEndpoint,
		deviceId,
		headers,
		additionalParams,
		resource,
	});

	const { data, error } = await fetchRefusingRedirects<object>(tokenEndpoint, {
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

export async function validateToken(
	token: string,
	jwksEndpoint: string,
	options?: {
		audience?: string | string[];
		issuer?: string | string[];
	},
) {
	const jwks = createRemoteJWKSet(new URL(jwksEndpoint), {
		[customFetch]: async (url, init) => {
			const response = await fetch(url, { ...init, ...NO_FOLLOW_REDIRECT });
			assertResponseNotRedirect(String(url), response);
			return response;
		},
	});
	const verified = await jwtVerify(token, jwks, {
		audience: options?.audience,
		issuer: options?.issuer,
	});
	return verified;
}
