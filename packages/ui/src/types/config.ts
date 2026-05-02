/**
 * Runtime configuration for the Better Auth UI.
 * This is injected by the server at request time.
 */
export interface BetterAuthUIConfig {
	/** Base URL for API calls (e.g., "/api/auth") */
	apiBaseUrl: string;
	/** Application name */
	appName: string;
	/** Logo URL */
	logo?: string;
	/** Redirect URL after successful auth */
	redirectTo: string;
	/** Available social providers */
	socialProviders: Array<{
		id: string;
		name: string;
		icon?: string;
	}>;
	/** Feature flags */
	features: {
		emailPassword: boolean;
		passkey: boolean;
		magicLink: boolean;
		rememberMe: boolean;
		emailVerification: boolean;
	};
	/** URL paths */
	paths: {
		signIn: string;
		signUp: string;
		forgotPassword: string;
		resetPassword: string;
		verifyEmail: string;
		profile: string;
	};
	/** Minimum password length */
	minPasswordLength: number;
	/** Current page being rendered */
	page:
		| "sign-in"
		| "sign-up"
		| "forgot-password"
		| "reset-password"
		| "verify-email"
		| "profile"
		| string;
	/**
	 * Whether the UI is rendered in embed mode.
	 * In embed mode, the page wrapper is not shown.
	 */
	embed?: boolean;
	/**
	 * Page-specific arguments passed from the parent component.
	 */
	args?: Record<string, unknown>;
}

/**
 * Default configuration values
 */
export const defaultConfig: BetterAuthUIConfig = {
	apiBaseUrl: "/api/auth",
	appName: "Better Auth",
	redirectTo: "/",
	socialProviders: [],
	features: {
		emailPassword: true,
		passkey: false,
		magicLink: false,
		rememberMe: true,
		emailVerification: false,
	},
	paths: {
		signIn: "/sign-in",
		signUp: "/sign-up",
		forgotPassword: "/forgot-password",
		resetPassword: "/reset-password",
		verifyEmail: "/verify-email",
		profile: "/profile",
	},
	minPasswordLength: 8,
	page: "sign-in",
	embed: false,
	args: {},
};
