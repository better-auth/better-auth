import { betterFetch } from "@better-fetch/fetch";
import type { OAuth2Tokens } from "./types";
import type { ProviderOptions } from "./types";
import { base64Url } from "@better-auth/utils/base64";

export function createRefreshAccessTokenRequest({
	refreshToken,
	options,
	scope,
	authentication,
	resource,
}: {
	refreshToken: string;
	options: ProviderOptions;
	scope?: string;
	authentication?: "basic" | "post";
	resource?: string | string[];
}) {
	const body = new URLSearchParams();
	const headers: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};

	body.set("grant_type", "refresh_token");
	body.set("refresh_token", refreshToken);
	scope && body.set("scope", scope);
	if (resource) {
    if (typeof resource === 'string') {
      body.append('resource', resource);
    } else {
      for (const val of resource) {
        body.append('resource', val);
      }
    }
	}
	if (authentication === "basic") {
		const encodedCredentials = base64Url.encode(
			`${options.clientId}:${options.clientSecret}`,
		);
		headers["authorization"] = `Basic ${encodedCredentials}`;
	} else {
		body.set("client_id", options.clientId);
		body.set("client_secret", options.clientSecret);
	}

	return {
		body,
		headers,
	}
}

export async function refreshAccessToken({
	refreshToken,
	options,
	scope,
	tokenEndpoint,
	authentication,
	resource,
}: {
	refreshToken: string;
	options: ProviderOptions;
	scope?: string;
	tokenEndpoint: string;
	authentication?: "basic" | "post";
	resource?: string | string[]
}): Promise<OAuth2Tokens> {
	const {
		body,
		headers,
	} = createRefreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		resource,
	})

	const { data, error } = await betterFetch<{
		access_token: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
		id_token?: string;
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

	return tokens;
}
