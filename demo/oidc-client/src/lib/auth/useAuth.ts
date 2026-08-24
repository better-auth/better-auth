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

		if (!as.authorization_endpoint) {
			throw new Error("Authorization endpoint is not available");
		}

		const authorizationUrl = new URL(as.authorization_endpoint);
		authorizationUrl.searchParams.set("client_id", client.client_id);
		authorizationUrl.searchParams.set("redirect_uri", redirectUri);
		authorizationUrl.searchParams.set("response_type", "code");
		authorizationUrl.searchParams.set("scope", scope);
		authorizationUrl.searchParams.set("code_challenge", code_challenge);
		authorizationUrl.searchParams.set(
			"code_challenge_method",
			code_challenge_method,
		);

		const state = oauth.generateRandomState();
		authorizationUrl.searchParams.set("state", state);

		const nonce = oauth.generateRandomNonce();
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

		try {
			const storage = sessionStorage.getItem(webStorageKey);
			if (!storage) {
				console.error("No stored code_verifier and nonce found");
				return;
			}
			sessionStorage.removeItem(webStorageKey);
			const storedState: unknown = JSON.parse(storage);
			if (
				typeof storedState !== "object" ||
				storedState === null ||
				!("code_verifier" in storedState) ||
				typeof storedState.code_verifier !== "string" ||
				!("state" in storedState) ||
				typeof storedState.state !== "string" ||
				!("nonce" in storedState) ||
				typeof storedState.nonce !== "string" ||
				!("redirectUri" in storedState) ||
				typeof storedState.redirectUri !== "string"
			) {
				console.error("Stored authorization state is malformed");
				return;
			}

			const { code_verifier, state, nonce, redirectUri } = storedState;

			const currentUrl = new URL(window.location.href);
			const params = oauth.validateAuthResponse(as, client, currentUrl, state);
			const authorizationResponse = await oauth.authorizationCodeGrantRequest(
				as,
				client,
				oauth.None(),
				params,
				redirectUri,
				code_verifier,
			);
			const authorizationCodeResult =
				await oauth.processAuthorizationCodeResponse(
					as,
					client,
					authorizationResponse,
					{ expectedNonce: nonce, requireIdToken: true },
				);

			console.log("Access Token Response", authorizationCodeResult);
			const accessToken = authorizationCodeResult.access_token;
			setAccessToken(accessToken);
			setIdToken(authorizationCodeResult.id_token);
			const claims = oauth.getValidatedIdTokenClaims(authorizationCodeResult);
			console.log("ID Token Claims", claims);
			if (!claims) {
				console.error("ID Token Claims are missing");
				return;
			}

			// UserInfo Request
			const response = await oauth.userInfoRequest(as, client, accessToken);
			const user = await oauth.processUserInfoResponse(
				as,
				client,
				claims.sub,
				response,
			);
			console.log("UserInfo Response", user);
			setUser(user);

			window.history.replaceState(
				{},
				document.title,
				redirectUri || window.location.origin,
			);
		} catch (error) {
			if (
				error instanceof oauth.AuthorizationResponseError ||
				error instanceof oauth.ResponseBodyError
			) {
				console.error("Error Response", error.cause);
				return;
			}

			if (error instanceof oauth.WWWAuthenticateChallengeError) {
				for (const challenge of error.cause) {
					console.error("WWW-Authenticate Challenge", challenge);
				}
				return;
			}

			throw error;
		} finally {
			setHandlingRedirect(false);
		}
	};

	const logout = () => {
		if (!as || !idToken) {
			return;
		}

		if (!as.end_session_endpoint) {
			throw new Error("End session endpoint is not available");
		}

		const endSessionUrl = new URL(as.end_session_endpoint);
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
