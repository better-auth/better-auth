import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import type { AwaitableFunction } from "../types";
import type { ClientAssertionConfig } from "./client-assertion";
import { signClientAssertion } from "./client-assertion";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";

export async function refreshAccessTokenRequest({
	refreshToken,
	options,
	authentication,
	clientAssertion,
	tokenEndpoint,
	extraParams,
	resource,
}: {
	refreshToken: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	authentication?: ("basic" | "post" | "private_key_jwt") | undefined;
	clientAssertion?: ClientAssertionConfig | undefined;
	/** Token endpoint URL. Used as the JWT `aud` claim when signing assertions. */
	tokenEndpoint?: string | undefined;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}) {
	options = typeof options === "function" ? await options() : options;

	if (authentication === "private_key_jwt") {
		if (!clientAssertion) {
			throw new Error(
				"private_key_jwt authentication requires a clientAssertion configuration",
			);
		}
		let assertion = clientAssertion.assertion;
		if (!assertion) {
			const primaryClientId = Array.isArray(options.clientId)
				? options.clientId[0]
				: options.clientId;
			const audEndpoint = tokenEndpoint ?? clientAssertion.tokenEndpoint;
			if (!audEndpoint) {
				throw new Error(
					"private_key_jwt requires a tokenEndpoint for the JWT audience claim",
				);
			}
			assertion = await signClientAssertion({
				clientId: primaryClientId,
				tokenEndpoint: audEndpoint,
				privateKeyJwk: clientAssertion.privateKeyJwk,
				privateKeyPem: clientAssertion.privateKeyPem,
				kid: clientAssertion.kid,
				algorithm: clientAssertion.algorithm,
				expiresIn: clientAssertion.expiresIn,
			});
		}
		extraParams = {
			...extraParams,
			client_assertion: assertion,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		};
	}

	return createRefreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		extraParams,
		resource,
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
}: {
	refreshToken: string;
	options: ProviderOptions;
	authentication?: ("basic" | "post" | "private_key_jwt") | undefined;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
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
	if (authentication === "basic") {
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
	} else if (authentication === "private_key_jwt") {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
		// client_assertion + client_assertion_type flow through extraParams
	} else {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
		if (options.clientSecret) {
			body.set("client_secret", options.clientSecret);
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
	clientAssertion,
	extraParams,
}: {
	refreshToken: string;
	options: Partial<ProviderOptions>;
	tokenEndpoint: string;
	authentication?: ("basic" | "post" | "private_key_jwt") | undefined;
	clientAssertion?: ClientAssertionConfig | undefined;
	extraParams?: Record<string, string> | undefined;
}): Promise<OAuth2Tokens> {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		clientAssertion,
		tokenEndpoint,
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
