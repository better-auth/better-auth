import { BetterAuthError } from "../error";
import type { AwaitableFunction } from "../types";
import type { ProviderOptions } from "./oauth-provider";
import { fetchRefusingRedirects } from "./reject-redirects";
import type {
	TokenEndpointAuth,
	TokenEndpointSecretAuthentication,
} from "./token-endpoint-auth";
import {
	applyTokenEndpointAuth,
	setCallerTokenRequestHeaders,
} from "./token-endpoint-auth";

export interface PushAuthorizationRequestInput {
	/**
	 * The complete front-channel authorization URL, as built by
	 * `createAuthorizationURL`. Its query parameters become the pushed request.
	 */
	authorizationURL: URL;
	/**
	 * The authorization endpoint the user agent is sent to with the returned
	 * `request_uri`. Query parameters already on it are kept.
	 */
	authorizationEndpoint: string;
	/** The server's `pushed_authorization_request_endpoint`. */
	pushedAuthorizationRequestEndpoint: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	/**
	 * The token endpoint, passed to client assertion getters as the audience.
	 * RFC 9126 §2 requires the server to accept it for PAR client
	 * authentication. Defaults to the pushed authorization request endpoint.
	 */
	tokenEndpoint?: string | undefined;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	authentication?: TokenEndpointSecretAuthentication | undefined;
	/**
	 * Extra headers for the pushed request. `Authorization` is rejected; client
	 * authentication sets it.
	 */
	headers?: Record<string, string> | undefined;
}

/**
 * Sends an authorization request to the server's pushed authorization request
 * endpoint (RFC 9126) and returns the URL to redirect the user agent to.
 *
 * The client authenticates the same way it does at the token endpoint
 * (RFC 9126 §2). The returned URL carries only `client_id` and `request_uri`
 * (RFC 9126 §4), so the request parameters never pass through the browser.
 */
export async function pushAuthorizationRequest({
	authorizationURL,
	authorizationEndpoint,
	pushedAuthorizationRequestEndpoint,
	options,
	tokenEndpoint,
	tokenEndpointAuth,
	authentication,
	headers,
}: PushAuthorizationRequestInput): Promise<URL> {
	options = typeof options === "function" ? await options() : options;
	const body = new URLSearchParams(authorizationURL.searchParams);
	const requestHeaders: Record<string, string> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
	};
	setCallerTokenRequestHeaders(requestHeaders, headers);

	await applyTokenEndpointAuth({
		body,
		headers: requestHeaders,
		options,
		tokenEndpoint: tokenEndpoint || pushedAuthorizationRequestEndpoint,
		grantType: "authorization_code",
		tokenEndpointAuth,
		authentication,
	});

	const { data, error } = await fetchRefusingRedirects<{
		request_uri?: unknown;
	}>(pushedAuthorizationRequestEndpoint, {
		method: "POST",
		body,
		headers: requestHeaders,
	});
	if (error) {
		const code = "error" in error ? ` (${String(error.error)})` : "";
		throw new BetterAuthError(
			`The pushed authorization request was rejected with status ${error.status}${code}`,
		);
	}
	const requestUri = data?.request_uri;
	if (typeof requestUri !== "string" || !requestUri) {
		throw new BetterAuthError(
			"The pushed authorization request response has no request_uri",
		);
	}

	const url = new URL(authorizationEndpoint);
	url.searchParams.set("client_id", body.get("client_id") ?? "");
	url.searchParams.set("request_uri", requestUri);
	return url;
}
