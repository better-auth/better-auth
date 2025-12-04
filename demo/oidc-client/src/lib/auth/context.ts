import type { AuthorizationServer, Client } from "oauth4webapi";
import { createContext } from "react";

export type AuthContextType = {
	as?: AuthorizationServer;
	client: Client;
	accessToken?: string;
	setAccessToken: (token?: string) => void;
	idToken?: string;
	setIdToken: (token?: string) => void;
	user?: Record<string, unknown>;
	setUser: (user?: Record<string, unknown>) => void;
};

export const AuthContext = createContext<AuthContextType>({
	client: { client_id: "", token_endpoint_auth_method: "none" },
	setAccessToken: () => {},
	setIdToken: () => {},
	setUser: () => {},
});
