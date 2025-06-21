import type { GenericEndpointContext } from "../types";
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
		user: {
			id: string;
			name?: string;
			email?: string | null;
			image?: string;
			emailVerified: boolean;
		};
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
	options?: ProviderOptions;
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
		| "select_account+consent";
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

/**
 * OAuth state payload structure
 */
export interface OAuthStatePayload {
	/**
	 * The callback URL to redirect to after OAuth completion
	 */
	callbackURL: string;
	/**
	 * The PKCE code verifier for OAuth 2.0 flows
	 */
	codeVerifier: string;
	/**
	 * The error callback URL
	 */
	errorURL?: string;
	/**
	 * The new user callback URL
	 */
	newUserURL?: string;
	/**
	 * Link account information
	 */
	link?: {
		email: string;
		userId: string;
	};
	/**
	 * Expiration timestamp in milliseconds
	 */
	expiresAt: number;
	/**
	 * Whether to request sign up
	 */
	requestSignUp?: boolean;
}

/**
 * State management configuration
 *
 * Allows custom state generation and parsing strategies for OAuth flows.
 * This is useful for implementing stateless state management, cross-environment
 * OAuth flows, or other custom state handling requirements.
 *
 * @example
 * ```ts
 * // Stateless state management using encryption
 * const stateManagement: StateManagement = {
 *   generateState: async (ctx, payload) => {
 *     const encryptedState = await symmetricEncrypt({
 *       key: ctx.context.secret,
 *       data: JSON.stringify(payload)
 *     });
 *     return encodeURIComponent(encryptedState);
 *   },
 *   parseState: async (ctx, state) => {
 *     try {
 *       const decryptedState = await symmetricDecrypt({
 *         key: ctx.context.secret,
 *         data: decodeURIComponent(state)
 *       });
 *       return JSON.parse(decryptedState);
 *     } catch {
 *       return undefined; // Fallback to default behavior
 *     }
 *   }
 * };
 * ```
 *
 * @example
 * ```ts
 * // Custom state management with Redis
 * const stateManagement: StateManagement = {
 *   generateState: async (ctx, payload) => {
 *     const stateId = generateRandomString(32);
 *     await redis.setex(`oauth:state:${stateId}`, 600, JSON.stringify(payload));
 *     return stateId;
 *   },
 *   parseState: async (ctx, state) => {
 *     const data = await redis.get(`oauth:state:${state}`);
 *     if (data) {
 *       await redis.del(`oauth:state:${state}`);
 *       return JSON.parse(data);
 *     }
 *     return undefined; // Fallback to default behavior
 *   }
 * };
 * ```
 */
export interface StateManagement {
	/**
	 * Custom state generation function
	 *
	 * @param ctx - The endpoint context
	 * @param payload - The OAuth state payload to encode
	 * @returns A string representing the state, or undefined to fallback to
	 * default behavior
	 */
	generateState?: (
		ctx: GenericEndpointContext,
		payload: OAuthStatePayload,
	) => Promise<string | undefined>;
	/**
	 * Custom state parsing function
	 *
	 * @param ctx - The endpoint context
	 * @param state - The state string to decode
	 * @returns The parsed OAuth state payload, or undefined to fallback to
	 * default behavior
	 */
	parseState?: (
		ctx: GenericEndpointContext,
		state: string,
	) => Promise<OAuthStatePayload | undefined>;
}
