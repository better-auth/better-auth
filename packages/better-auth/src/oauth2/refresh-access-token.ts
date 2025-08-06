import { betterFetch } from "@better-fetch/fetch";
import type { OAuth2Tokens } from "./types";
import type { ProviderOptions } from "./types";
import { base64 } from "@better-auth/utils/base64";

export async function refreshAccessToken({
	refreshToken,
	options,
	tokenEndpoint,
	authentication,
	extraParams,
	grantType = "refresh_token",
}: {
	refreshToken: string;
	options: ProviderOptions;
	tokenEndpoint: string;
	authentication?: "basic" | "post";
	extraParams?: Record<string, string>;
	grantType?: string;
}): Promise<OAuth2Tokens> {
	const body = new URLSearchParams();
	const headers: Record<string, any> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};

	body.set("grant_type", grantType);
	body.set("refresh_token", refreshToken);
	// Use standard Base64 encoding for HTTP Basic Auth (OAuth2 spec, RFC 7617)
	// Fixes compatibility with providers like Notion, Twitter, etc.
	if (authentication === "basic") {
		headers["authorization"] = base64.encode(
			`${options.clientId}:${options.clientSecret}`,
		);
	} else {
		body.set("client_id", options.clientId);
		body.set("client_secret", options.clientSecret);
	}

	if (extraParams) {
		for (const [key, value] of Object.entries(extraParams)) {
			body.set(key, value);
		}
	}

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
