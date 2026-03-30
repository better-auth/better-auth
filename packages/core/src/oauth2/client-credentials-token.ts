import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import type { AwaitableFunction } from "../types";
import type { ClientAssertionConfig } from "./client-assertion";
import { signClientAssertion } from "./client-assertion";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";

export async function clientCredentialsTokenRequest({
	options,
	scope,
	authentication,
	clientAssertion,
	tokenEndpoint,
	resource,
}: {
	options: AwaitableFunction<ProviderOptions>;
	scope?: string | undefined;
	authentication?: ("basic" | "post" | "private_key_jwt") | undefined;
	clientAssertion?: ClientAssertionConfig | undefined;
	/** Token endpoint URL. Used as the JWT `aud` claim when signing assertions. */
	tokenEndpoint?: string | undefined;
	resource?: (string | string[]) | undefined;
}) {
	options = typeof options === "function" ? await options() : options;

	let extraParams: Record<string, string> | undefined;
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
			client_assertion: assertion,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		};
	}

	return createClientCredentialsTokenRequest({
		options,
		scope,
		authentication,
		resource,
		extraParams,
	});
}

/**
 * @deprecated use async'd clientCredentialsTokenRequest instead
 */
export function createClientCredentialsTokenRequest({
	options,
	scope,
	authentication,
	resource,
	extraParams,
}: {
	options: ProviderOptions;
	scope?: string | undefined;
	authentication?: ("basic" | "post" | "private_key_jwt") | undefined;
	resource?: (string | string[]) | undefined;
	extraParams?: Record<string, string> | undefined;
}) {
	const body = new URLSearchParams();
	const headers: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};

	body.set("grant_type", "client_credentials");
	scope && body.set("scope", scope);
	if (resource) {
		if (typeof resource === "string") {
			body.append("resource", resource);
		} else {
			for (const _resource of resource) {
				body.append("resource", _resource);
			}
		}
	}
	if (authentication === "basic") {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		const encodedCredentials = base64.encode(
			`${primaryClientId}:${options.clientSecret ?? ""}`,
		);
		headers["authorization"] = `Basic ${encodedCredentials}`;
	} else if (authentication === "private_key_jwt") {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
	} else {
		const primaryClientId = Array.isArray(options.clientId)
			? options.clientId[0]
			: options.clientId;
		body.set("client_id", primaryClientId);
		if (options.clientSecret) {
			body.set("client_secret", options.clientSecret);
		}
	}

	if (extraParams) {
		for (const [key, value] of Object.entries(extraParams)) {
			if (!body.has(key)) body.append(key, value);
		}
	}

	return {
		body,
		headers,
	};
}

export async function clientCredentialsToken({
	options,
	tokenEndpoint,
	scope,
	authentication,
	clientAssertion,
	resource,
}: {
	options: AwaitableFunction<ProviderOptions>;
	tokenEndpoint: string;
	scope: string;
	authentication?: ("basic" | "post" | "private_key_jwt") | undefined;
	clientAssertion?: ClientAssertionConfig | undefined;
	resource?: (string | string[]) | undefined;
}): Promise<OAuth2Tokens> {
	const { body, headers } = await clientCredentialsTokenRequest({
		options,
		scope,
		authentication,
		clientAssertion,
		tokenEndpoint,
		resource,
	});

	const { data, error } = await betterFetch<{
		access_token: string;
		expires_in?: number | undefined;
		token_type?: string | undefined;
		scope?: string | undefined;
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
		tokenType: data.token_type,
		scopes: data.scope?.split(" "),
	};

	if (data.expires_in) {
		const now = new Date();
		tokens.accessTokenExpiresAt = new Date(
			now.getTime() + data.expires_in * 1000,
		);
	}

	return tokens;
}
