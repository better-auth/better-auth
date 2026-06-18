import { betterFetch } from "@better-fetch/fetch";
import type { AwaitableFunction } from "../types";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";
import type {
	TokenEndpointAuth,
	TokenEndpointSecretAuthentication,
} from "./token-endpoint-auth";
import { applyTokenEndpointAuth } from "./token-endpoint-auth";

interface RefreshAccessTokenRequestInput {
	refreshToken: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	authentication?: TokenEndpointSecretAuthentication | undefined;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	tokenEndpoint?: string | undefined;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}

interface RefreshAccessTokenRequestBaseInput {
	refreshToken: string;
	options: ProviderOptions;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}

interface RefreshAccessTokenInput extends RefreshAccessTokenRequestInput {
	options: Partial<ProviderOptions>;
	tokenEndpoint: string;
}

/**
 * Body keys owned by the refresh-token flow or unsafe to copy from caller input.
 */
const BLOCKED_REFRESH_TOKEN_PARAMS = [
	"grant_type",
	"refresh_token",
	"__proto__",
	"constructor",
	"prototype",
] as const;

const BLOCKED_REFRESH_TOKEN_PARAMS_SET: ReadonlySet<string> = new Set(
	BLOCKED_REFRESH_TOKEN_PARAMS,
);

export async function refreshAccessTokenRequest({
	refreshToken,
	options,
	authentication,
	tokenEndpointAuth,
	tokenEndpoint,
	extraParams,
	resource,
}: RefreshAccessTokenRequestInput) {
	options = typeof options === "function" ? await options() : options;
	const request = buildRefreshAccessTokenRequest({
		refreshToken,
		options,
		extraParams,
		resource,
	});

	await applyTokenEndpointAuth({
		body: request.body,
		headers: request.headers,
		options,
		tokenEndpoint: tokenEndpoint ?? "",
		grantType: "refresh_token",
		tokenEndpointAuth,
		authentication,
	});

	return request;
}

function applyRefreshExtraParams(
	body: URLSearchParams,
	extraParams: Record<string, string> | undefined,
) {
	if (!extraParams) return;
	for (const [key, value] of Object.entries(extraParams)) {
		if (BLOCKED_REFRESH_TOKEN_PARAMS_SET.has(key)) continue;
		body.set(key, value);
	}
}

function buildRefreshAccessTokenRequest({
	refreshToken,
	options,
	extraParams,
	resource,
}: RefreshAccessTokenRequestBaseInput) {
	const body = new URLSearchParams();
	const headers: Record<string, string> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};

	body.set("grant_type", "refresh_token");
	body.set("refresh_token", refreshToken);
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
		applyRefreshExtraParams(body, extraParams);
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
	tokenEndpointAuth,
	extraParams,
	resource,
}: RefreshAccessTokenInput): Promise<OAuth2Tokens> {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		tokenEndpointAuth,
		tokenEndpoint,
		extraParams,
		resource,
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
