import { createOAuth2Request, sendTokenRequest } from "arctic/dist/request";
import type { ProviderOptions } from ".";
import { getBaseURL } from "../utils/base-url";

export function getRedirectURI(providerId: string, redirectURI?: string) {
	return redirectURI || `${getBaseURL()}/callback/${providerId}`;
}

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
}: {
	code: string;
	redirectURI: string;
	options: ProviderOptions;
	codeVerifier?: string;
	tokenEndpoint: string;
}) {
	const body = new URLSearchParams();
	body.set("grant_type", "authorization_code");
	body.set("code", code);
	body.set("code_verifier", codeVerifier || "");
	body.set("redirect_uri", redirectURI);
	body.set("client_id", options.clientId);
	body.set("client_secret", options.clientSecret);
	const request = createOAuth2Request(tokenEndpoint, body);
	const tokens = await sendTokenRequest(request);
	return tokens;
}
