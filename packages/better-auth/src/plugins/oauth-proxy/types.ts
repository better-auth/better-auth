/**
 * Encrypted state package for cross-origin OAuth proxy flow
 */
export type OAuthProxyStatePackage = {
	state: string;
	stateCookie: string;
	isOAuthProxy: boolean;
};
