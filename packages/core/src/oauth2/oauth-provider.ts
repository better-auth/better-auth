import type { LiteralString } from "../types";

export interface OAuth2Tokens {
	tokenType?: string;
	accessToken?: string;
	refreshToken?: string;
	accessTokenExpiresAt?: Date;
	refreshTokenExpiresAt?: Date;
	scopes?: string[];
	idToken?: string;
}

export type OAuth2UserInfo = {
	id: string | number;
	name?: string;
	email?: string | null;
	image?: string;
	emailVerified: boolean;
};

export interface OAuthProvider<
	T extends Record<string, any> = Record<string, any>,
	O extends Record<string, any> = Partial<ProviderOptions>,
> {
	id: LiteralString;
	createAuthorizationURL: (data: {
		state: string;
		codeVerifier: string;
		scopes?: string[];
		redirectURI: string;
		display?: string;
		loginHint?: string;
	}) => Promise<URL> | URL;
	name: string;
	validateAuthorizationCode: (data: {
		code: string;
		redirectURI: string;
		codeVerifier?: string;
		deviceId?: string;
	}) => Promise<OAuth2Tokens>;
	getUserInfo: (
		token: OAuth2Tokens & {
			/**
			 * The user object from the provider
			 * This is only available for some providers like Apple
			 */
			user?: {
				name?: {
					firstName?: string;
					lastName?: string;
				};
				email?: string;
			};
		},
	) => Promise<{
		user: OAuth2UserInfo;
		data: T;
	} | null>;
	/**
	 * Custom function to refresh a token
	 */
	refreshAccessToken?: (refreshToken: string) => Promise<OAuth2Tokens>;
	revokeToken?: (token: string) => Promise<void>;
	/**
	 * Verify the id token
	 * @param token - The id token
	 * @param nonce - The nonce
	 * @returns True if the id token is valid, false otherwise
	 */
	verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean;
	/**
	 * Options for the provider
	 */
	options?: O;
}

export type ProviderOptions<Profile extends Record<string, any> = any> = {
	/**
	 * The client ID of your application.
	 *
	 * This is usually a string but can be any type depending on the provider.
	 */
	clientId?: unknown;
	/**
	 * The client secret of your application
	 */
	clientSecret?: string;
	/**
	 * The scopes you want to request from the provider
	 */
	scope?: string[];
	/**
	 * Remove default scopes of the provider
	 */
	disableDefaultScope?: boolean;
	/**
	 * The redirect URL for your application. This is where the provider will
	 * redirect the user after the sign in process. Make sure this URL is
	 * whitelisted in the provider's dashboard.
	 */
	redirectURI?: string;
	/**
	 * The client key of your application
	 * Tiktok Social Provider uses this field instead of clientId
	 */
	clientKey?: string;
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
	 * Custom function to refresh a token
	 */
	refreshAccessToken?: (refreshToken: string) => Promise<OAuth2Tokens>;
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
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean;
	/**
	 * The prompt to use for the authorization code request
	 */
	prompt?:
		| "select_account"
		| "consent"
		| "login"
		| "none"
		| "select_account consent";
	/**
	 * The response mode to use for the authorization code request
	 */
	responseMode?: "query" | "form_post";
	/**
	 * If enabled, the user info will be overridden with the provider user info
	 * This is useful if you want to use the provider user info to update the user info
	 *
	 * @default false
	 */
	overrideUserInfoOnSignIn?: boolean;
};
