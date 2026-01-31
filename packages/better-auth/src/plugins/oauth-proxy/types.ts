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
	/**
	 * Flag indicating this callback is being processed on the preview server
	 * after an early redirect from the production server.
	 */
	_oauthProxyEarlyRedirect?: boolean;
};

/**
 * Encrypted state package for cross-origin OAuth proxy flow
 */
export type OAuthProxyStatePackage = {
	state: string;
	stateCookie: string;
	isOAuthProxy: boolean;
	/**
	 * If true, the production server will redirect to the preview server
	 * BEFORE processing the callback, allowing the preview server to run
	 * the full callback logic against its own database.
	 */
	earlyRedirect?: boolean;
	/**
	 * The preview server's base URL to redirect to for early redirect flow.
	 * Required when earlyRedirect is true.
	 */
	previewBaseURL?: string;
};
