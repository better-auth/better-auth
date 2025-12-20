import type { AuthContext, InternalAdapter } from "@better-auth/core";

/**
 * Snapshot of OAuth configuration state for temporary modifications
 */
type OAuthConfigSnapshot = {
	storeStateStrategy: AuthContext["oauthConfig"]["storeStateStrategy"];
	skipStateCookieCheck: AuthContext["oauthConfig"]["skipStateCookieCheck"];
	internalAdapter: InternalAdapter;
};

export type AuthContextWithSnapshot = AuthContext & {
	_oauthProxySnapshot?: OAuthConfigSnapshot;
};

/**
 * Encrypted state package for cross-origin OAuth proxy flow
 */
export type OAuthProxyStatePackage = {
	state: string;
	stateCookie: string;
	isOAuthProxy: boolean;
};
