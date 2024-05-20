import { base64url } from "jose";
import { generateRandomString } from "../crypto/random";
import { sha256 } from "../crypto/sha";
import { ProviderError } from "@better-auth/shared/error";
import type { OAuthProvider, OIDCProvider } from "../providers/types";
import type { SignInContext } from "../routes/signin";
import { discoveryRequest } from "./utils";

export async function signInOAuth(
	context: SignInContext,
	provider: OAuthProvider | OIDCProvider,
	autoCreateSession = true,
	/**
	 * If onlySignUp is true, it will only sign up the
	 * user. If the user exists, it will throw an error
	 * on the callback.
	 */
	onlySignUp = false,
) {
	if (!provider.params.clientId) {
		throw new ProviderError("clientId is required");
	}
	const scopes = Array.from(new Set(provider?.scopes ?? []));
	const { currentURL, callbackURL, data } = context.request.body;
	const state = generateState(
		currentURL,
		callbackURL,
		data,
		autoCreateSession,
		onlySignUp,
	);
	let url = provider.params.authorizationEndpoint;
	if (!url) {
		const discovery = await discoveryRequest(context, provider);
		if (!discovery.authorization_endpoint)
			throw new ProviderError("Missing authorization endpoint");
		url = discovery.authorization_endpoint as string;
	}
	const authorizationUrl = new URL(url);
	authorizationUrl.searchParams.set("response_type", "code");
	authorizationUrl.searchParams.set("client_id", provider.params.clientId);
	authorizationUrl.searchParams.set("state", state);
	authorizationUrl.searchParams.set("scope", scopes.join(" "));
	authorizationUrl.searchParams.set(
		"redirect_uri",
		provider.params.redirectURL ||
			`${context.request.url.toString()}/callback/${
				context.request.body.provider
			}`,
	);

	if (provider.type === "oidc") {
		/**
		 * If the provider is an OIDC provider, we need to add the nonce parameter
		 * to the authorization URL. The nonce parameter is a string value used to
		 * associate a client session with an ID Token, and to mitigate replay attacks.
		 */
		if (provider.nonce) {
			const nonce = generateRandomString(24);
			authorizationUrl.searchParams.set("nonce", nonce);
			context.request.cookies.set(
				context.cookies.nonce.name,
				nonce,
				context.cookies.nonce.options,
			);
		}
	}
	provider.params.responseMode &&
		authorizationUrl.searchParams.set(
			"response_mode",
			provider.params.responseMode,
		);

	if (provider.params.extra) {
		const extra = Object.entries(provider.params.extra);
		for (const [key, value] of extra) {
			authorizationUrl.searchParams.set(key, value);
		}
	}
	const codeVerifier = provider.pkCodeVerifier
		? generateCodeVerifier()
		: undefined;
	if (provider.pkCodeVerifier && codeVerifier) {
		const codeChallengeMethod = provider?.codeChallengeMethod ?? "S256";
		if (codeChallengeMethod === "S256") {
			const codeChallengeBuffer = await sha256(
				new TextEncoder().encode(codeVerifier),
			);
			const codeChallenge = base64url.encode(
				new Uint8Array(codeChallengeBuffer),
			);
			authorizationUrl.searchParams.set("code_challenge", codeChallenge);
			authorizationUrl.searchParams.set("code_challenge_method", "S256");
		} else {
			authorizationUrl.searchParams.set("code_challenge", codeVerifier);
			authorizationUrl.searchParams.set("code_challenge_method", "plain");
		}
	}
	context.request.cookies.set(
		context.cookies.state.name,
		state,
		context.cookies.state.options,
	);
	if (codeVerifier) {
		context.request.cookies.set(
			context.cookies.pkCodeVerifier.name,
			codeVerifier,
			context.cookies.pkCodeVerifier.options,
		);
	}
	return authorizationUrl.toString();
}

export function generateCodeVerifier(): string {
	const randomValues = new Uint8Array(32);
	crypto.getRandomValues(randomValues);
	return base64url.encode(randomValues);
}

/**
 * The callbackURL is the URL that the provider will
 * redirect to after the user. If not provided, it will
 * redirect to the current URL. If any error occurs, if error
 * page isn't specified on the config, it will redirect to
 * the current URL with the error query parameter.
 */
export function generateState(
	currentURL: string,
	callbackURL?: string,
	signUp?: Record<string, any>,
	autoCreateSession?: boolean,
	onlySignUp?: boolean,
): string {
	let state = generateRandomString(24);
	state += `!${currentURL}`;
	state += `!${callbackURL || currentURL}`;
	state += `!${JSON.stringify({
		data: signUp,
		autoCreateSession,
		onlySignUp,
	})}`;
	return state;
}

export function getState(state: string): {
	hash: string;
	currentURL: string;
	callbackURL: string;
	signUp: {
		data: Record<string, any>;
		autoCreateSession: boolean | undefined;
		onlySignUp: boolean | undefined;
	};
} {
	const [hash, currentURL, callbackURL, signUpString] = state.split("!");
	if (!hash || !currentURL || !callbackURL) {
		throw new ProviderError("Invalid state");
	}
	const signUp = signUpString ? JSON.parse(signUpString) : undefined;
	return {
		hash,
		currentURL,
		callbackURL,
		signUp: {
			data: signUp?.data || {},
			autoCreateSession: signUp?.autoCreateSession,
			onlySignUp: signUp?.onlySignUp,
		},
	};
}
