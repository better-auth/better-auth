import type { JWTPayload } from "jose";
import type { AwaitableFunction } from "../types";
import type { ProviderOptions } from "./index";
import { getOAuth2Tokens } from "./index";
import { fetchRefusingRedirects } from "./reject-redirects";
import type {
	TokenEndpointAuth,
	TokenEndpointSecretAuthentication,
} from "./token-endpoint-auth";
import { applyTokenEndpointAuth } from "./token-endpoint-auth";
import { verifyJwsToken } from "./verify";

interface AuthorizationCodeRequestInput {
	code: string;
	redirectURI: string;
	options: AwaitableFunction<Partial<ProviderOptions>>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	authentication?: TokenEndpointSecretAuthentication | undefined;
	tokenEndpointAuth?: TokenEndpointAuth | undefined;
	tokenEndpoint?: string | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}

interface AuthorizationCodeRequestBaseInput {
	code: string;
	redirectURI: string;
	options: Partial<ProviderOptions>;
	codeVerifier?: string | undefined;
	deviceId?: string | undefined;
	headers?: Record<string, string> | undefined;
	additionalParams?: Record<string, string> | undefined;
	resource?: (string | string[]) | undefined;
}

interface ValidateAuthorizationCodeInput extends AuthorizationCodeRequestInput {
	tokenEndpoint: string;
}

export async function authorizationCodeRequest({
	code,
	codeVerifier,
	redirectURI,
	options,
	authentication,
	tokenEndpointAuth,
	tokenEndpoint,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: AuthorizationCodeRequestInput) {
	options = typeof options === "function" ? await options() : options;
	const request = buildAuthorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		deviceId,
		headers,
		additionalParams,
		resource,
	});

	await applyTokenEndpointAuth({
		body: request.body,
		headers: request.headers,
		options,
		tokenEndpoint: tokenEndpoint ?? "",
		grantType: "authorization_code",
		tokenEndpointAuth,
		authentication,
	});

	return request;
}

function buildAuthorizationCodeRequest({
	code,
	codeVerifier,
	redirectURI,
	options,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: AuthorizationCodeRequestBaseInput) {
	const body = new URLSearchParams();
	const requestHeaders: Record<string, string> = {
		"content-type": "application/x-www-form-urlencoded",
		accept: "application/json",
		...headers,
	};

	body.set("grant_type", "authorization_code");
	body.set("code", code);
	codeVerifier && body.set("code_verifier", codeVerifier);
	options.clientKey && body.set("client_key", options.clientKey);
	deviceId && body.set("device_id", deviceId);
	body.set("redirect_uri", options.redirectURI || redirectURI);
	if (resource) {
		if (typeof resource === "string") {
			body.append("resource", resource);
		} else {
			for (const _resource of resource) {
				body.append("resource", _resource);
			}
		}
	}
	for (const [key, value] of Object.entries(additionalParams)) {
		if (!body.has(key)) body.append(key, value);
	}

	return {
		body,
		headers: requestHeaders,
	};
}

export async function validateAuthorizationCode({
	code,
	codeVerifier,
	redirectURI,
	options,
	tokenEndpoint,
	authentication,
	tokenEndpointAuth,
	deviceId,
	headers,
	additionalParams = {},
	resource,
}: ValidateAuthorizationCodeInput) {
	const { body, headers: requestHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI,
		options,
		authentication,
		tokenEndpointAuth,
		tokenEndpoint,
		deviceId,
		headers,
		additionalParams,
		resource,
	});

	const { data, error } = await fetchRefusingRedirects<object>(tokenEndpoint, {
		method: "POST",
		body: body,
		headers: requestHeaders,
	});
	if (error) {
		throw error;
	}
	const tokens = getOAuth2Tokens(data);
	return tokens;
}

/**
 * Verifies a JWT's signature against the key set at `jwksEndpoint`.
 *
 * Beyond the signature, only `exp` and `nbf` (when present) and the claims named
 * in `options` are checked. Without `audience` and `issuer`, a token the same key
 * set signed for another client or issuer also verifies, so pass both whenever
 * the token proves identity.
 */
export async function validateToken<PayloadType = JWTPayload>(
	token: string,
	jwksEndpoint: string,
	options?: {
		audience?: string | string[];
		issuer?: string | string[];
		/**
		 * Allowed JWS algorithms. Omit to use JOSE's default algorithm policy.
		 */
		algorithms?: string[];
		/**
		 * Claims that must be present. Claim values require separate validation.
		 */
		requiredClaims?: string[];
		/**
		 * Allowed clock skew in seconds. Defaults to zero.
		 */
		clockTolerance?: number;
	},
) {
	return verifyJwsToken<PayloadType>(token, {
		jwksFetch: new URL(jwksEndpoint).href,
		verifyOptions: {
			audience: options?.audience,
			issuer: options?.issuer,
			algorithms: options?.algorithms,
			requiredClaims: options?.requiredClaims,
			clockTolerance: options?.clockTolerance,
		},
	});
}
