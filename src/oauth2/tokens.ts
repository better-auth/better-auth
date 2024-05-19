import { base64url } from "jose";
import type { OAuthProvider, OIDCProvider } from "../providers";
import type { CallbackContext } from "../routes/callback";
import { discoveryRequest } from "./utils";

export async function getTokens(
	context: CallbackContext,
	provider: OIDCProvider | OAuthProvider,
) {
	const redirectURL =
		provider.params.redirectURL ||
		`${context.baseURL}${context.basePath}/callback/${provider.id}`;
	const headers = new Headers();
	headers.set("Content-Type", "application/x-www-form-urlencoded");
	headers.set("Accept", "application/json");
	headers.set("User-Agent", "better-auth");
	const encodedCredentials = base64url.encode(
		`${provider.params.clientId}:${provider.params.clientSecret}`,
	);
	headers.set("Authorization", `Basic ${encodedCredentials}`);
	const body = new URLSearchParams();
	body.set("grant_type", "authorization_code");
	body.set("code", context.request.query.code);
	body.set("redirect_uri", redirectURL);
	if (provider.pkCodeVerifier) {
		const codeVerifier = context.request.cookies.get(
			context.cookies.pkCodeVerifier.name,
		);
		//TODO: maybe it should throw if it's not available
		codeVerifier && body.set("code_verifier", codeVerifier);
	}
	body.set("client_id", provider.params.clientId);
	body.set("client_secret", provider.params.clientSecret);
	let url = provider.params.tokenEndpoint;
	if (!url) {
		const discovery = await discoveryRequest(context, provider);
		if (!discovery.token_endpoint) {
			throw new Error("Missing token endpoint");
		}
		url = discovery.token_endpoint;
	}
	const response = await fetch(url, {
		method: "POST",
		body,
		headers,
	});
	const data: TokenResponse | TokenErrorResponse = await response.json();
	return data;
}

export interface TokenResponse {
	access_token: string;
	token_type?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	error: undefined;
}

export interface TokenErrorResponse {
	error: string;
	error_description?: string;
}
