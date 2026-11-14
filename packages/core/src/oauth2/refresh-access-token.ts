import type { BetterFetchOption } from "@better-fetch/fetch";
import type { AwaitableFunction } from "../types";
import type { OAuth2Tokens, ProviderOptions } from "./oauth-provider";
import { fetchRefusingRedirects } from "./reject-redirects";
import type {
	TokenEndpointAuth,
	TokenEndpointSecretAuthentication,
} from "./token-endpoint-auth";
import {
	applyTokenEndpointAuth,
	setCallerTokenRequestHeaders,
} from "./token-endpoint-auth";
import { parseScopeField } from "./utils";

interface RefreshAccessTokenRequestInput {
	refreshToken: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	authentication?: TokenEndpointSecretAuthentication | undefined;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	tokenEndpoint?: string | undefined;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
	/**
	 * Extra headers to send to the token endpoint. `Authorization` is rejected;
	 * set it from `tokenEndpointAuth: { method: "custom", customizeRequest }`.
	 */
	headers?: Record<string, string> | undefined;
}

interface RefreshAccessTokenRequestBaseInput {
	refreshToken: string;
	options: ProviderOptions;
	extraParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
	headers?: Record<string, string> | undefined;
}

interface RefreshAccessTokenInput extends RefreshAccessTokenRequestInput {
	options: Partial<ProviderOptions>;
	tokenEndpoint: string;
	/**
	 * The fetch implementation for the request, such as one from
	 * `createDpopFetch` to send DPoP proofs (RFC 9449).
	 *
	 * @default globalThis.fetch
	 */
	fetch?: BetterFetchOption["customFetchImpl"];
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
	headers,
}: RefreshAccessTokenRequestInput) {
	options = typeof options === "function" ? await options() : options;
	const request = buildRefreshAccessTokenRequest({
		refreshToken,
		options,
		extraParams,
		resource,
		headers,
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
	headers: extraHeaders,
}: RefreshAccessTokenRequestBaseInput) {
	const body = new URLSearchParams();
	const headers: Record<string, string> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};
	setCallerTokenRequestHeaders(headers, extraHeaders);

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
	headers: extraHeaders,
	fetch,
}: RefreshAccessTokenInput): Promise<OAuth2Tokens> {
	const { body, headers } = await refreshAccessTokenRequest({
		refreshToken,
		options,
		authentication,
		tokenEndpointAuth,
		tokenEndpoint,
		extraParams,
		resource,
		headers: extraHeaders,
	});

	const { data, error } = await fetchRefusingRedirects<{
		access_token?: string | undefined;
		refresh_token?: string | undefined;
		expires_in?: number | undefined;
		refresh_token_expires_in?: number | undefined;
		token_type?: string | undefined;
		scope?: unknown;
		id_token?: string | undefined;
	}>(tokenEndpoint, {
		method: "POST",
		body,
		headers,
		customFetchImpl: fetch,
	});
	if (error) {
		throw error;
	}
	// A response without an access token is not a successful one, even with a 200 status.
	if (typeof data.access_token !== "string" || !data.access_token) {
		throw data;
	}
	const tokens: OAuth2Tokens = {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		tokenType: data.token_type,
		scopes: parseScopeField(data.scope),
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
