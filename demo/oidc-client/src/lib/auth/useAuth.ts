// This code is heavily based on the following example: https://github.com/panva/oauth4webapi/blob/HEAD/examples/oidc.ts

import * as oauth from "oauth4webapi";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "./context";

const webStorageKey = "oidc:auth";

type LoginParams = {
	scope?: string;
	redirectUri?: string;
};

export const useAuth = () => {
	const {
		accessToken,
		setAccessToken,
		idToken,
		setIdToken,
		setUser,
		client,
		user,
		as,
	} = useContext(AuthContext);
	const [isHandlingRedirect, setHandlingRedirect] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	const login = async (params?: LoginParams) => {
		if (!as) {
			return;
		}

		if (!client) {
			throw new Error("Client is not available");
		}

		const scope = params?.scope || "openid profile email";
		let redirectUri = params?.redirectUri;
		if (
			!redirectUri &&
			Array.isArray(client.redirect_uris) &&
			client.redirect_uris.length > 1
		) {
			redirectUri = client.redirect_uris[0]?.toString();
		}
		redirectUri = redirectUri || window.location.origin;

		const code_challenge_method = "S256";
		/**
		 * The following MUST be generated for every redirect to the authorization_endpoint. You must store
		 * the code_verifier and nonce in the end-user session such that it can be recovered as the user
		 * gets redirected from the authorization server back to your application.
		 */
		const code_verifier = oauth.generateRandomCodeVerifier();
		const code_challenge =
			await oauth.calculatePKCECodeChallenge(code_verifier);
		let state: string | undefined;
		let nonce: string | undefined;

		const authorizationUrl = new URL(as.authorization_endpoint!);
		authorizationUrl.searchParams.set("client_id", client.client_id);
		authorizationUrl.searchParams.set("redirect_uri", redirectUri);
		authorizationUrl.searchParams.set("response_type", "code");
		authorizationUrl.searchParams.set("scope", scope);
		authorizationUrl.searchParams.set("code_challenge", code_challenge);
		authorizationUrl.searchParams.set(
			"code_challenge_method",
			code_challenge_method,
		);

		state = oauth.generateRandomState();
		authorizationUrl.searchParams.set("state", state);

		nonce = oauth.generateRandomNonce();
		authorizationUrl.searchParams.set("nonce", nonce);

		console.log("store code_verifier and nonce in the end-user session");
		sessionStorage.setItem(
			webStorageKey,
			JSON.stringify({ code_verifier, state, nonce, redirectUri }),
		);

		console.log(
			"Redirect to Authorization Server",
			authorizationUrl.toString(),
		);
		window.location.assign(authorizationUrl.toString());
	};

	const handleLoginRedirect = async () => {
		if (!as || !client || isHandlingRedirect) {
			return;
		}

		setHandlingRedirect(true);

		const storage = sessionStorage.getItem(webStorageKey);
		if (!storage) {
			console.error("No stored code_verifier and nonce found");
			return;
		}
		sessionStorage.removeItem(webStorageKey);
		const { code_verifier, state, nonce, redirectUri } = JSON.parse(storage);

		let sub: string;
		let accessToken: string;

		// @ts-expect-error
		const currentUrl: URL = new URL(window.location);
		const params = oauth.validateAuthResponse(as, client, currentUrl, state);
		if (oauth.isOAuth2Error(params)) {
			console.error("Error Response", params);
			setHandlingRedirect(false);
			return;
		}

		const authorizationResponse = await oauth.authorizationCodeGrantRequest(
			as,
			client,
			params,
			redirectUri,
			code_verifier,
		);

		let challenges: oauth.WWWAuthenticateChallenge[] | undefined;
		if (
			(challenges = oauth.parseWwwAuthenticateChallenges(authorizationResponse))
		) {
			for (const challenge of challenges) {
				console.error("WWW-Authenticate Challenge", challenge);
			}
			setHandlingRedirect(false);
			return;
		}

		const authorizationCodeResult =
			await oauth.processAuthorizationCodeOpenIDResponse(
				as,
				client,
				authorizationResponse,
				nonce,
			);
		if (oauth.isOAuth2Error(authorizationCodeResult)) {
			console.error("Error Response", authorizationCodeResult);
			setHandlingRedirect(false);
			return;
		}

		console.log("Access Token Response", authorizationCodeResult);
		accessToken = authorizationCodeResult.access_token;
		setAccessToken(accessToken);
		setIdToken(authorizationCodeResult.id_token);
		const claims = oauth.getValidatedIdTokenClaims(authorizationCodeResult);
		console.log("ID Token Claims", claims);
		sub = claims.sub;

		// UserInfo Request
		const response = await oauth.userInfoRequest(as, client, accessToken);
		if ((challenges = oauth.parseWwwAuthenticateChallenges(response))) {
			for (const challenge of challenges) {
				console.error("WWW-Authenticate Challenge", challenge);
			}
			setHandlingRedirect(false);
			return;
		}

		const user = await oauth.processUserInfoResponse(as, client, sub, response);
		console.log("UserInfo Response", user);
		setUser(user);

		setHandlingRedirect(false);
		window.history.replaceState(
			{},
			document.title,
			redirectUri || window.location.origin,
		);
	};

	const logout = () => {
		if (!as || !idToken) {
			return;
		}

		const endSessionUrl = new URL(as.end_session_endpoint!);
		endSessionUrl.searchParams.set(
			"post_logout_redirect_uri",
			window.location.origin,
		);
		endSessionUrl.searchParams.set("id_token_hint", idToken);
		console.log("Redirect to End Session Endpoint", endSessionUrl.toString());

		// Clear state and localStorage
		setAccessToken(undefined);
		setIdToken(undefined);
		setUser(undefined);
		localStorage.removeItem("oidc:state");

		window.location.assign(endSessionUrl.toString());
	};

	useEffect(() => {
		const handleAuth = () => {
			if (window.location.search.includes("code=")) {
				void handleLoginRedirect()
					.catch((error) => {
						console.error("Failed to handle login redirect", error);
					})
					.finally(() => {
						setIsLoading(false);
					});
			} else {
				setIsLoading(false);
			}
		};

		if (as && client) {
			handleAuth();
		}
	}, [window.location.search, as, client]);

	return {
		user,
		isAuthenticated: !!user,
		isLoading,
		accessToken,
		login,
		handleLoginRedirect,
		logout,
	};
};
