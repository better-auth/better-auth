import type { Client } from "oauth4webapi";
import { discoveryRequest, processDiscoveryResponse } from "oauth4webapi";
import { useEffect, useState } from "react";
import type { AuthContextType } from "./context";
import { AuthContext } from "./context";

type AuthProviderProps = {
	issuer: string;
	clientId: string;
	children: React.ReactNode;
};

const STORAGE_KEY = "oidc:state";

export const AuthProvider: React.FC<AuthProviderProps> = ({
	children,
	issuer,
	clientId,
}) => {
	const client: Client = {
		client_id: clientId,
		token_endpoint_auth_method: "none",
		redirect_uris: [window.location.origin],
	};

	const [as, setAs] = useState<AuthContextType["as"]>();
	const [accessToken, setAccessTokenState] =
		useState<AuthContextType["accessToken"]>();
	const [idToken, setIdTokenState] = useState<AuthContextType["idToken"]>();
	const [user, setUserState] = useState<AuthContextType["user"]>();

	// Wrapper functions to persist to localStorage
	const setAccessToken = (token?: string) => {
		setAccessTokenState(token);
		if (token) {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ ...stored, accessToken: token }),
			);
		}
	};

	const setIdToken = (token?: string) => {
		setIdTokenState(token);
		if (token) {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ ...stored, idToken: token }),
			);
		}
	};

	const setUser = (userData?: Record<string, unknown>) => {
		setUserState(userData);
		if (userData) {
			const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ ...stored, user: userData }),
			);
		} else {
			localStorage.removeItem(STORAGE_KEY);
		}
	};

	// Load from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const { accessToken, idToken, user } = JSON.parse(stored);
				if (accessToken) setAccessTokenState(accessToken);
				if (idToken) setIdTokenState(idToken);
				if (user) setUserState(user);
			}
		} catch (error) {
			console.error("Failed to load auth state from localStorage", error);
		}
	}, []);

	useEffect(() => {
		if (!issuer || as) {
			return;
		}

		try {
			const issuerUrl = new URL(issuer);
			discoveryRequest(issuerUrl, { algorithm: "oidc" })
				.then((response) => processDiscoveryResponse(issuerUrl, response))
				.then((as) => setAs(as))
				.catch((error) =>
					console.error("Failed to fetch issuer metadata", error),
				);
		} catch (error) {
			console.error("Failed to fetch issuer metadata", error);
		}
	}, [issuer]);

	return (
		<AuthContext.Provider
			value={{
				as,
				client,
				accessToken,
				setAccessToken,
				idToken,
				setIdToken,
				user,
				setUser,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
