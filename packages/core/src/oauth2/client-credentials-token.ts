import { base64 } from "@better-auth/utils/base64";
import { betterFetch } from "@better-fetch/fetch";
import type { AwaitableFunction } from "../types";
import type { ClientAssertionProvider } from "./client-assertion";
import { resolveAssertionParams } from "./client-assertion";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";

export async function clientCredentialsTokenRequest({
	options,
	scope,
	authentication,
	clientAssertionProvider,
	resource,
}: {
	options: AwaitableFunction<ProviderOptions>;
	scope?: string | undefined;
	authentication?: ("basic" | "post") | undefined;
	clientAssertionProvider?: ClientAssertionProvider | undefined;
	tokenEndpoint?: string | undefined;
	resource?: (string | string[]) | undefined;
}) {
	options = typeof options === "function" ? await options() : options;

	let extraParams: Record<string, string> | undefined;
	const resolvedClientAssertionProvider =
		clientAssertionProvider ?? options.clientAssertionProvider;
	if (resolvedClientAssertionProvider) {
		extraParams = await resolveAssertionParams({
			clientAssertionProvider: resolvedClientAssertionProvider,
		});
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
	authentication?: ("basic" | "post") | undefined;
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
	const primaryClientId = Array.isArray(options.clientId)
		? options.clientId[0]
		: options.clientId;
	const hasClientAssertion = !!extraParams?.client_assertion;
	if (authentication === "basic" && !hasClientAssertion) {
		const encodedCredentials = base64.encode(
			`${primaryClientId}:${options.clientSecret ?? ""}`,
		);
		headers["authorization"] = `Basic ${encodedCredentials}`;
	} else {
		body.set("client_id", primaryClientId);
		if (!hasClientAssertion && options.clientSecret) {
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
	clientAssertionProvider,
	resource,
}: {
	options: AwaitableFunction<ProviderOptions>;
	tokenEndpoint: string;
	scope: string;
	authentication?: ("basic" | "post") | undefined;
	clientAssertionProvider?: ClientAssertionProvider | undefined;
	resource?: (string | string[]) | undefined;
}): Promise<OAuth2Tokens> {
	const { body, headers } = await clientCredentialsTokenRequest({
		options,
		scope,
		authentication,
		clientAssertionProvider,
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
