import type { ZodSchema } from "zod";
import type { User } from "../adapters/types";
import type { TokenResponse } from "../oauth2/tokens";
import type { SignInContext } from "../routes/signin";
import type { SignUpContext } from "../routes/signup";
import type {
	Context,
	GenericHandler,
	InternalResponse,
} from "../routes/types";
import type { apple } from "./apple";
import type { credential } from "./credential";
import type { discord } from "./discord";
import type { facebook } from "./facebook";
import type { github } from "./github";
import type { gitlab } from "./gitlab";
import type { google } from "./google";
import type { magicLink } from "./magic-link";
import type { spotify } from "./spotify";
import type { Twitch } from "./twitch";

export type ProviderType = "oauth" | "oidc" | "custom";

export type Provider<T extends Record<string, any> = any> =
	| OAuthProvider<T>
	| OIDCProvider<T>
	| CustomProvider;

interface BaseProvider {
	/**
	 * Make sure this is inferred as a literal type
	 *
	 * @example
	 * ```ts
	 * id: "custom" as const;
	 * ```
	 */
	id: string;
	/**
	 * The name of the provider
	 */
	name: string;
}

interface BaseOAuthProvider<T> extends BaseProvider {
	/**
	 * The scopes you want to request from the provider
	 */
	scopes: string[];
	/**
	 * The issuer of the provider. This will be used to discover the endpoints
	 * for the provider, if the endpoints are not provided.
	 */
	issuer?: string;
	/**
	 * The parameters required for the provider
	 */
	params: {
		clientId: string;
		clientSecret: string;
		authorizationEndpoint?: string;
		tokenEndpoint?: string;
		redirectURL?: string;
		/**
		 * Extra parameters to be sent to the provider. This will be sent as query parameters.
		 */
		extra?: Record<string, string>;
		linkAccounts?: {
			field: string;
			key: keyof T;
			enabler?: (profile: T) => Promise<boolean> | boolean;
		};
		responseMode?: "form_post" | "query";
	};
	/**
	 * If PKCE should be used for this provider
	 */
	pkCodeVerifier?: boolean;
	/**
	 * code_challenge_method for PKCE
	 */
	codeChallengeMethod?: "S256" | "plain";
	/**
	 * Get the tokens from the provider
	 */
	getTokens?: (context: Context) => Promise<TokenResponse>;
}

export interface OAuthProvider<
	T extends Record<string, any> = Record<string, any>,
> extends BaseOAuthProvider<T> {
	/**i
	 * The type of the provider
	 */
	type: "oauth";
	/**
	 * Get the user info from the provider
	 */
	getUserInfo: (tokens: TokenResponse) => Promise<T>;
}

export interface OIDCProvider<
	T extends Record<string, any> = Record<string, any>,
> extends BaseOAuthProvider<T> {
	/**
	 * The type of the provider
	 */
	type: "oidc";
	/**
	 * If nonce should be used for this provider
	 */
	nonce?: boolean;
	/**
	 * Get the user info from the provider
	 */
	getUserInfo: (tokens: {
		accessToken: string;
		id_token: string;
		refresh_token?: string;
		expires_in?: number;
	}) => Promise<T>;
}

export interface CustomProvider<Input extends ZodSchema = ZodSchema>
	extends BaseProvider {
	/**
	 * The type of the provider
	 */
	type: "custom";
	/**
	 * Sign in the user
	 */
	signIn?: (context: Context) => Promise<InternalResponse>;
	/**
	 * Sign up the user
	 */
	signUp?: (context: SignUpContext) => Promise<InternalResponse>;
	/**
	 * The signin Input schema for the provider
	 */
	input: Input;
	/**
	 * Options Schema
	 */
	options?: ZodSchema;
	/**
	 * Custom handler for a provider. This can be used to handle custom callbacks.
	 */
	handler?: {
		matcher: (context: Context) => boolean;
		handler: GenericHandler;
	};
}

export interface ProviderOptions<T> {
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
	scopes?: string[];
	/**
	 * The redirect URL for your application. This is where the provider will
	 * redirect the user after the sign in process. Make sure this URL is
	 * whitelisted in the provider's dashboard.
	 */
	redirectURL?: string;
	/**
	 * ⚠ Advanced Option: link multiple accounts to a single user. This is
	 * useful when you want to allow users to sign in
	 * with multiple providers.
	 *
	 * ► NOTE: This option might expose your application to account takeover
	 * attacks. Make sure you have proper security measures in place.
	 * @default false
	 */
	linkAccounts?: {
		/**
		 * The filed in the user schema to match the account
		 */
		field: string;
		/**
		 * The key on the provider profile to match the value
		 */
		key: keyof T;
		/**
		 * The enabler function to check if the account should be linked
		 *
		 * @example
		 * ```ts
		 * enabler: (profile) => profile.email_verified
		 * ```
		 * strongly recommended to use this option to prevent account takeover attacks
		 */
		enabler?: (profile: T) => Promise<boolean> | boolean;
	};
}

export type Providers = {
	apple: ReturnType<typeof apple>;
	credential: ReturnType<typeof credential>;
	discord: ReturnType<typeof discord>;
	facebook: ReturnType<typeof facebook>;
	github: ReturnType<typeof github>;
	gitlab: ReturnType<typeof gitlab>;
	"magic-link": ReturnType<typeof magicLink>;
	google: ReturnType<typeof google>;
	spotify: ReturnType<typeof spotify>;
	twitch: ReturnType<typeof Twitch>;
};
