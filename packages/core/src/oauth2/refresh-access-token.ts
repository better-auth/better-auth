import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import type { AwaitableFunction } from "../types";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";
import { CLIENT_ASSERTION_TYPE_JWT_BEARER } from "./validate-authorization-code";

export async function refreshAccessTokenRequest({
	refreshToken,
	options,
	authentication,
	extraParams,
	resource,
}: {
	refreshToken: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	authentication?: ("basic" | "post") | undefined;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}) {
	options = typeof options === "function" ? await options() : options;
	const clientAssertion =
		!options.clientSecret && options.clientAssertionProvider
			? await options.clientAssertionProvider()
			: undefined;
	return createRefreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		extraParams,
		resource,
		clientAssertion,
	});
}

/**
 * @deprecated use async'd refreshAccessTokenRequest instead
 */
export function createRefreshAccessTokenRequest({
	refreshToken,
	options,
	authentication,
	extraParams,
	resource,
	clientAssertion,
}: {
	refreshToken: string;
	options: ProviderOptions;
	authentication?: ("basic" | "post") | undefined;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
	clientAssertion?: string | undefined;
}) {
	const body = new URLSearchParams();
	const headers: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};

	body.set("grant_type", "refresh_token");
	body.set("refresh_token", refreshToken);
	// Use standard Base64 encoding for HTTP Basic Auth (OAuth2 spec, RFC 7617)
	// Fixes compatibility with providers like Notion, Twitter, etc.
	// A client assertion is always carried in the body per RFC 7523, even if the
	// caller requested `basic` authentication.
	const useClientAssertion = !options.clientSecret && !!clientAssertion;
	if (authentication === "basic" && !useClientAssertion) {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		if (primaryClientId) {
			headers["authorization"] =
				"Basic " +
				base64.encode(`${primaryClientId}:${options.clientSecret ?? ""}`);
		} else {
			headers["authorization"] =
				"Basic " + base64.encode(`:${options.clientSecret ?? ""}`);
		}
	} else {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
		if (options.clientSecret) {
			body.set("client_secret", options.clientSecret);
		} else if (clientAssertion) {
			body.set("client_assertion_type", CLIENT_ASSERTION_TYPE_JWT_BEARER);
			body.set("client_assertion", clientAssertion);
		}
	}

	if (resource) {
		if (typeof resource === "string") {
			body.append("resource", resource);
		} else {
			for (const _resource of resource) {
				body.append("resource", _resource);
			}
		}
	}
	if (extraParams) {
		for (const [key, value] of Object.entries(extraParams)) {
			body.set(key, value);
		}
	}

	return {
		body,
		headers,
	};
}

export async function refreshAccessToken({
	refreshToken,
	options,
	tokenEndpoint,
	authentication,
	extraParams,
}: {
	refreshToken: string;
	options: Partial<ProviderOptions>;
	tokenEndpoint: string;
	authentication?: ("basic" | "post") | undefined;
	extraParams?: Record<string, string> | undefined;
}): Promise<OAuth2Tokens> {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		extraParams,
	});

	const { data, error } = await betterFetch<{
		access_token: string;
		refresh_token?: string | undefined;
		expires_in?: number | undefined;
		refresh_token_expires_in?: number | undefined;
		token_type?: string | undefined;
		scope?: string | undefined;
		id_token?: string | undefined;
	}>(tokenEndpoint, {
		method: "POST",
		body,
		headers,
	});
	if (error) {
		throw error;
	}
	const tokens: OAuth2Tokens = {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		tokenType: data.token_type,
		scopes: data.scope?.split(" "),
		idToken: data.id_token,
	};

	if (data.expires_in) {
		const now = new Date();
		tokens.accessTokenExpiresAt = new Date(
			now.getTime() + data.expires_in * 1000,
		);
	}

	if (data.refresh_token_expires_in) {
		const now = new Date();
		tokens.refreshTokenExpiresAt = new Date(
			now.getTime() + data.refresh_token_expires_in * 1000,
		);
	}

	return tokens;
}
