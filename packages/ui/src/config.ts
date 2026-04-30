/**
 * Runtime configuration injected by BetterAuth.
 * These globals are set before the React app loads.
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
		| "profile";
}

declare global {
	interface Window {
		__BETTER_AUTH_UI__?: Partial<BetterAuthUIConfig>;
	}
}

const defaultConfig: BetterAuthUIConfig = {
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
};

/**
 * Get the runtime configuration, merging defaults with injected values
 */
export function getConfig(): BetterAuthUIConfig {
	const injected =
		typeof window !== "undefined" ? window.__BETTER_AUTH_UI__ : {};

	return {
		...defaultConfig,
		...injected,
		features: {
			...defaultConfig.features,
			...injected?.features,
		},
		paths: {
			...defaultConfig.paths,
			...injected?.paths,
		},
	};
}

/**
 * Hook to get configuration in React components
 */
export function useConfig(): BetterAuthUIConfig {
	return getConfig();
}
