import type { AwaitableFunction } from "../types";
import { fetchPublicResource } from "../utils/public-fetch";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";
import type {
	TokenEndpointAuth,
	TokenEndpointSecretAuthentication,
} from "./token-endpoint-auth";
import { applyTokenEndpointAuth } from "./token-endpoint-auth";

interface ClientCredentialsTokenRequestInput {
	options: AwaitableFunction<ProviderOptions>;
	scope?: string | undefined;
	authentication?: TokenEndpointSecretAuthentication | undefined;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	tokenEndpoint?: string | undefined;
	resource?: (string | string[]) | undefined;
}

interface ClientCredentialsTokenRequestBaseInput {
	options: ProviderOptions;
	scope?: string | undefined;
	resource?: (string | string[]) | undefined;
	extraParams?: Record<string, string> | undefined;
}

interface ClientCredentialsTokenInput
	extends ClientCredentialsTokenRequestInput {
	tokenEndpoint: string;
	scope: string;
	/**
	 * Origins exempt from the public-routable gate, for an operator whose token
	 * endpoint runs on a private network. Forwarded to the SSRF fetch boundary.
	 */
	isTrustedOrigin?: (url: string) => boolean;
}

export async function clientCredentialsTokenRequest({
	options,
	scope,
	authentication,
	tokenEndpointAuth,
	tokenEndpoint,
	resource,
}: ClientCredentialsTokenRequestInput) {
	options = typeof options === "function" ? await options() : options;
	const request = buildClientCredentialsTokenRequest({
		options,
		scope,
		resource,
	});

	await applyTokenEndpointAuth({
		body: request.body,
		headers: request.headers,
		options,
		tokenEndpoint: tokenEndpoint ?? "",
		grantType: "client_credentials",
		tokenEndpointAuth,
		authentication,
	});

	return request;
}

function buildClientCredentialsTokenRequest({
	options,
	scope,
	resource,
	extraParams,
}: ClientCredentialsTokenRequestBaseInput) {
	const body = new URLSearchParams();
	const headers: Record<string, string> = {
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
	tokenEndpointAuth,
	resource,
	isTrustedOrigin,
}: ClientCredentialsTokenInput): Promise<OAuth2Tokens> {
	const { body, headers } = await clientCredentialsTokenRequest({
		options,
		scope,
		authentication,
		tokenEndpointAuth,
		tokenEndpoint,
		resource,
	});

	const { data, error } = await fetchPublicResource<{
		access_token: string;
		expires_in?: number | undefined;
		token_type?: string | undefined;
		scope?: string | undefined;
	}>(tokenEndpoint, {
		method: "POST",
		body,
		headers,
		isTrustedOrigin,
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
