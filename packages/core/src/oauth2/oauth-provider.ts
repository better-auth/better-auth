import type { LiteralString } from "../types";

export interface OAuth2Tokens {
	tokenType?: string | undefined;
	accessToken?: string | undefined;
	refreshToken?: string | undefined;
	accessTokenExpiresAt?: Date | undefined;
	refreshTokenExpiresAt?: Date | undefined;
	scopes?: string[] | undefined;
	idToken?: string | undefined;
	/**
	 * Raw token response from the provider.
	 * Preserves provider-specific fields that are not part of the standard OAuth2 token response.
	 */
	raw?: Record<string, unknown> | undefined;
}

export type OAuth2UserInfo = {
	id: string | number;
	name?: string | undefined;
	email?: (string | null) | undefined;
	image?: string | undefined;
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
		scopes?: string[] | undefined;
		redirectURI: string;
		display?: string | undefined;
		loginHint?: string | undefined;
	}) => Promise<URL> | URL;
	name: string;
	validateAuthorizationCode: (data: {
		code: string;
		redirectURI: string;
		codeVerifier?: string | undefined;
		deviceId?: string | undefined;
	}) => Promise<OAuth2Tokens>;
	getUserInfo: (
		token: OAuth2Tokens & {
			/**
			 * The user object from the provider
			 * This is only available for some providers like Apple
			 */
			user?:
				| {
						name?: {
							firstName?: string;
							lastName?: string;
						};
						email?: string;
				  }
				| undefined;
		},
	) => Promise<{
		user: OAuth2UserInfo;
		data: T;
	} | null>;
	/**
	 * Custom function to refresh a token
	 */
	refreshAccessToken?:
		| ((refreshToken: string) => Promise<OAuth2Tokens>)
		| undefined;
	revokeToken?: ((token: string) => Promise<void>) | undefined;
	/**
	 * Verify the id token
	 * @param token - The id token
	 * @param nonce - The nonce
	 * @returns True if the id token is valid, false otherwise
	 */
	verifyIdToken?:
		| ((token: string, nonce?: string) => Promise<boolean>)
		| undefined;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean | undefined;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean | undefined;
	/**
	 * Options for the provider
	 */
	options?: O | undefined;
}

export type ProviderOptions<Profile extends Record<string, any> = any> = {
	/**
	 * The client ID of your application.
	 *
	 * This is usually a string but can be any type depending on the provider.
	 */
	clientId?: unknown | undefined;
	/**
	 * The client secret of your application
	 */
	clientSecret?: string | undefined;
	/**
	 * The scopes you want to request from the provider
	 */
	scope?: string[] | undefined;
	/**
	 * Remove default scopes of the provider
	 */
	disableDefaultScope?: boolean | undefined;
	/**
	 * The redirect URL for your application. This is where the provider will
	 * redirect the user after the sign in process. Make sure this URL is
	 * whitelisted in the provider's dashboard.
	 */
	redirectURI?: string | undefined;
	/**
	 * The client key of your application
	 * Tiktok Social Provider uses this field instead of clientId
	 */
	clientKey?: string | undefined;
	/**
	 * Disable provider from allowing users to sign in
	 * with this provider with an id token sent from the
	 * client.
	 */
	disableIdTokenSignIn?: boolean | undefined;
	/**
	 * verifyIdToken function to verify the id token
	 */
	verifyIdToken?:
		| ((token: string, nonce?: string) => Promise<boolean>)
		| undefined;
	/**
	 * Custom function to get user info from the provider
	 */
	getUserInfo?:
		| ((token: OAuth2Tokens) => Promise<{
				user: {
					id: string;
					name?: string;
					email?: string | null;
					image?: string;
					emailVerified: boolean;
					[key: string]: any;
				};
				data: any;
		  } | null>)
		| undefined;
	/**
	 * Custom function to refresh a token
	 */
	refreshAccessToken?:
		| ((refreshToken: string) => Promise<OAuth2Tokens>)
		| undefined;
	/**
	 * Custom function to map the provider profile to a
	 * user.
	 */
	mapProfileToUser?:
		| ((profile: Profile) =>
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
				  }>)
		| undefined;
	/**
	 * Disable implicit sign up for new users. When set to true for the provider,
	 * sign-in need to be called with with requestSignUp as true to create new users.
	 */
	disableImplicitSignUp?: boolean | undefined;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean | undefined;
	/**
	 * The prompt to use for the authorization code request
	 */
	prompt?:
		| (
				| "select_account"
				| "consent"
				| "login"
				| "none"
				| "select_account consent"
		  )
		| undefined;
	/**
	 * The response mode to use for the authorization code request
	 */
	responseMode?: ("query" | "form_post") | undefined;
	/**
	 * If enabled, the user info will be overridden with the provider user info
	 * This is useful if you want to use the provider user info to update the user info
	 *
	 * @default false
	 */
	overrideUserInfoOnSignIn?: boolean | undefined;
};
