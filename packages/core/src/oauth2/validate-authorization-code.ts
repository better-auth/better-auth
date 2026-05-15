import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AwaitableFunction } from "../types";
import type { ClientAssertionProvider } from "./client-assertion";
import { resolveAssertionParams } from "./client-assertion";
import type { ProviderOptions } from "./index";
import { getOAuth2Tokens } from "./index";

export async function authorizationCodeRequest({
	code,
	codeVerifier,
	redirectURI,
	options,
	authentication,
	clientAssertionProvider,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: {
	code: string;
	redirectURI: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	authentication?: ("basic" | "post") | undefined;
	clientAssertionProvider?: ClientAssertionProvider | undefined;
	tokenEndpoint?: string | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}) {
	options = typeof options === "function" ? await options() : options;

	const resolvedClientAssertionProvider =
		clientAssertionProvider ?? options.clientAssertionProvider;
	if (resolvedClientAssertionProvider) {
		const assertionParams = await resolveAssertionParams({
			clientAssertionProvider: resolvedClientAssertionProvider,
		});
		additionalParams = { ...additionalParams, ...assertionParams };
	}

	return createAuthorizationCodeRequest({
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
}

/**
 * @deprecated use async'd authorizationCodeRequest instead
 */
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
	const primaryClientId = Array.isArray(options.clientId)
		? options.clientId[0]
		: options.clientId;
	const hasClientAssertion = !!additionalParams.client_assertion;
	if (authentication === "basic" && !hasClientAssertion) {
		const encodedCredentials = base64.encode(
			`${primaryClientId}:${options.clientSecret ?? ""}`,
		);
		requestHeaders["authorization"] = `Basic ${encodedCredentials}`;
	} else {
		body.set("client_id", primaryClientId);
		if (!hasClientAssertion && options.clientSecret) {
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
	clientAssertionProvider,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: {
	code: string;
	redirectURI: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	tokenEndpoint: string;
	authentication?: ("basic" | "post") | undefined;
	clientAssertionProvider?: ClientAssertionProvider | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}) {
	const { body, headers: requestHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		authentication,
		clientAssertionProvider,
		tokenEndpoint,
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

export async function validateToken(
	token: string,
	jwksEndpoint: string,
	options?: {
		audience?: string | string[];
		issuer?: string | string[];
	},
) {
	const jwks = createRemoteJWKSet(new URL(jwksEndpoint));
	const verified = await jwtVerify(token, jwks, {
		audience: options?.audience,
		issuer: options?.issuer,
	});
	return verified;
}
