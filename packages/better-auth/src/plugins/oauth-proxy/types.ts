import type { AuthContext, InternalAdapter } from "@better-auth/core";

/**
 * Encrypted state package for cross-origin OAuth proxy flow
 */
export type OAuthProxyStatePackage = {
	state: string;
	stateCookie: string;
	isOAuthProxy: boolean;
};

/**
 * Snapshot of OAuth configuration state for temporary modifications
 */
export type OAuthConfigSnapshot = {
	storeStateStrategy: AuthContext["oauthConfig"]["storeStateStrategy"];
	skipStateCookieCheck: AuthContext["oauthConfig"]["skipStateCookieCheck"];
	internalAdapter: InternalAdapter;
};
