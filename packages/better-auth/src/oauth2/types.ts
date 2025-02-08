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
		redirectURI: string;
	}) => Promise<URL> | URL;
	name: string;
	validateAuthorizationCode: (data: {
		code: string;
		redirectURI: string;
		codeVerifier?: string;
	}) => Promise<OAuth2Tokens>;
	getUserInfo: (token: OAuth2Tokens) => Promise<{
		user: {
			id: string;
			name?: string;
			email?: string | null;
			image?: string;
			emailVerified: boolean;
		};
		data: T;
	} | null>;
	refreshAccessToken?: (refreshToken: string) => Promise<OAuth2Tokens>;
	revokeToken?: (token: string) => Promise<void>;
	verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>;
}

export type ProviderOptions<Profile extends Record<string, any> = any> = {
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
	/**
	 * Disable provider from allowing users to sign in
	 * with this provider with an id token sent from the
	 * client.
	 */
	disableIdTokenSignIn?: boolean;
	/**
	 * verifyIdToken function to verify the id token
	 */
	verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>;
	/**
	 * Custom function to get user info from the provider
	 */
	getUserInfo?: (token: OAuth2Tokens) => Promise<{
		user: {
			id: string;
			name?: string;
			email?: string | null;
			image?: string;
			emailVerified: boolean;
			[key: string]: any;
		};
		data: any;
	}>;
	/**
	 * Custom function to map the provider profile to a
	 * user.
	 */
	mapProfileToUser?: (profile: Profile) =>
		| {
				id?: string;
				name?: string;
				email?: string | null;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }
		| Promise<{
				id?: string;
				name?: string;
				email?: string | null;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }>;
};
