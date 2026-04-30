/**
 * Theme configuration for the UI pages.
 * Uses CSS custom properties for runtime customization.
 */
export type UITheme = {
	/**
	 * Primary brand color used for buttons, links, and accents.
	 * @example "#0066cc"
	 */
	primaryColor?: string | undefined;
	/**
	 * Secondary color for less prominent UI elements.
	 * @example "#6c757d"
	 */
	secondaryColor?: string | undefined;
	/**
	 * Background color for the page.
	 * @example "#ffffff"
	 */
	backgroundColor?: string | undefined;
	/**
	 * Text color for the page.
	 * @example "#1a1a1a"
	 */
	textColor?: string | undefined;
	/**
	 * Error/danger color for validation messages.
	 * @example "#dc3545"
	 */
	errorColor?: string | undefined;
	/**
	 * Success color for success messages.
	 * @example "#28a745"
	 */
	successColor?: string | undefined;
	/**
	 * Border radius for UI elements.
	 * @example "8px"
	 */
	borderRadius?: string | undefined;
	/**
	 * Font family for the UI.
	 * @example "Inter, system-ui, sans-serif"
	 */
	fontFamily?: string | undefined;
	/**
	 * URL to the logo image.
	 * @example "/logo.png"
	 */
	logo?: string | undefined;
	/**
	 * Application name displayed in the UI.
	 * Falls back to the main `appName` option if not set.
	 */
	appName?: string | undefined;
	/**
	 * Enable dark mode support.
	 * @default false
	 */
	darkMode?:
		| boolean
		| {
				/**
				 * Enable dark mode
				 */
				enabled: boolean;
				/**
				 * Dark mode background color
				 */
				backgroundColor?: string | undefined;
				/**
				 * Dark mode text color
				 */
				textColor?: string | undefined;
				/**
				 * Dark mode primary color
				 */
				primaryColor?: string | undefined;
		  }
		| undefined;
};

/**
 * Configuration for individual page enablement.
 */
export type UIPageConfig = {
	/**
	 * Enable this page.
	 * @default true
	 */
	enabled?: boolean | undefined;
};

/**
 * Definition of a UI page.
 * Used by plugins to contribute custom pages.
 */
export type UIPage = {
	/**
	 * The URL path for this page (relative to the UI base path).
	 * @example "/two-factor-setup"
	 */
	path: string;
	/**
	 * The pre-built HTML content for this page.
	 * Theme variables will be injected at runtime.
	 */
	html: string;
	/**
	 * Optional title for the page.
	 */
	title?: string | undefined;
};

/**
 * Configuration for built-in pages.
 */
export type UIBuiltInPages = {
	/**
	 * Sign-in page configuration.
	 */
	signIn?: UIPageConfig | undefined;
	/**
	 * Sign-up page configuration.
	 */
	signUp?: UIPageConfig | undefined;
	/**
	 * Forgot password page configuration.
	 */
	forgotPassword?: UIPageConfig | undefined;
	/**
	 * Reset password page configuration.
	 */
	resetPassword?: UIPageConfig | undefined;
	/**
	 * Email verification page configuration.
	 */
	verifyEmail?: UIPageConfig | undefined;
	/**
	 * User profile/settings page configuration.
	 */
	profile?: UIPageConfig | undefined;
};

/**
 * UI configuration options for Better Auth.
 */
export type UIOptions = {
	/**
	 * Enable the UI feature.
	 * @default true when ui option is provided
	 */
	enabled?: boolean | undefined;
	/**
	 * Theme configuration for customizing the appearance.
	 */
	theme?: UITheme | undefined;
	/**
	 * Configuration for built-in pages.
	 * Each page can be enabled or disabled individually.
	 */
	pages?: UIBuiltInPages | undefined;
	/**
	 * Base path for the UI routes.
	 * This is combined with the path where you mount the uiHandler.
	 *
	 * @default ""
	 *
	 * @example
	 * If you mount uiHandler at "/auth" and set basePath to "/ui",
	 * the sign-in page would be at "/auth/ui/sign-in"
	 */
	basePath?: string | undefined;
	/**
	 * The base URL for API calls from the UI pages.
	 * Defaults to the main Better Auth baseURL + basePath.
	 *
	 * @example "https://api.myapp.com/api/auth"
	 */
	apiBaseUrl?: string | undefined;
	/**
	 * Redirect URL after successful sign-in.
	 * @default "/"
	 */
	redirectTo?: string | undefined;
	/**
	 * Additional custom pages provided by the application.
	 */
	customPages?: UIPage[] | undefined;
};

/**
 * UI extension for plugins.
 * Allows plugins to contribute custom UI pages.
 */
export type BetterAuthPluginUI = {
	/**
	 * Custom pages provided by the plugin.
	 */
	pages?: UIPage[] | undefined;
};
