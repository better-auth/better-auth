import type { User } from "../db/schema";
import type { oAuthProviderList } from ".";
import type { LiteralString } from "../types/helper";

export interface OAuth2Tokens {
	tokenType?: string;
	accessToken?: string;
	refreshToken?: string;
	accessTokenExpiresAt?: Date;
	refreshTokenExpiresAt?: Date;
	scopes?: string[];
	idToken?: string;
}

export interface OAuthProvider<
	T extends Record<string, any> = Record<string, any>,
> {
	id: LiteralString;
	createAuthorizationURL: (data: {
		state: string;
		codeVerifier: string;
		scopes?: string[];
		redirectURI?: string;
	}) => Promise<URL> | URL;
	name: string;
	validateAuthorizationCode: (
		code: string,
		codeVerifier?: string,
		redirectURI?: string,
	) => Promise<OAuth2Tokens>;
	getUserInfo: (token: OAuth2Tokens) => Promise<{
		user: Omit<User, "createdAt" | "updatedAt">;
		data: T;
	} | null>;
	refreshAccessToken?: (refreshToken: string) => Promise<OAuth2Tokens>;
	revokeToken?: (token: string) => Promise<void>;
}

export type OAuthProviderList = typeof oAuthProviderList;

export type ProviderOptions = {
	/**
	 * The client ID of your application
	 */
	clientId: string;
	/**
	 * The client secret of your application
	 */
	clientSecret: string;
	/**
	 * The scopes you want to request from the provider
	 */
	scope?: string[];
	/**
	 * The redirect URL for your application. This is where the provider will
	 * redirect the user after the sign in process. Make sure this URL is
	 * whitelisted in the provider's dashboard.
	 */
	redirectURI?: string;
};
