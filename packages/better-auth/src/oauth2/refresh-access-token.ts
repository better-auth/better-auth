import { betterFetch } from "@better-fetch/fetch";
import type { OAuth2Tokens } from "./types";
import type { ProviderOptions } from "./types";
import { base64 } from "@better-auth/utils/base64";

export function createRefreshAccessTokenRequest({
	refreshToken,
	options,
	authentication,
	extraParams,
	resource,
}: {
	refreshToken: string;
	options: Partial<ProviderOptions>;
	authentication?: "basic" | "post";
	extraParams?: Record<string, string>;
	resource?: string | string[];
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
		if (options.clientId) {
			headers["authorization"] =
				"Basic " +
				base64.encode(`${options.clientId}:${options.clientSecret ?? ""}`);
		} else {
			headers["authorization"] =
				"Basic " + base64.encode(`:${options.clientSecret ?? ""}`);
		}
	} else {
		options.clientId && body.set("client_id", options.clientId);
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
	extraParams,
}: {
	refreshToken: string;
	options: Partial<ProviderOptions>;
	tokenEndpoint: string;
	authentication?: "basic" | "post";
	extraParams?: Record<string, string>;
	/** @deprecated always "refresh_token" */
	grantType?: string;
}): Promise<OAuth2Tokens> {
	const { body, headers } = createRefreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		extraParams,
	});

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
