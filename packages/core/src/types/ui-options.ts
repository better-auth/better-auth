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
 * Metadata for UI pages (SEO, social sharing).
 */
export type UIPageMetadata = {
	/**
	 * Page title.
	 */
	title?: string | undefined;
	/**
	 * Page description for SEO.
	 */
	description?: string | undefined;
	/**
	 * Open Graph image URL.
	 */
	image?: string | undefined;
	/**
	 * Open Graph type.
	 * @default "website"
	 */
	ogType?: string | undefined;
	/**
	 * Twitter card type.
	 */
	twitterCard?: "summary" | "summary_large_image" | undefined;
	/**
	 * Additional meta tags.
	 */
	additionalMeta?:
		| Array<{ name?: string; property?: string; content: string }>
		| undefined;
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
	/**
	 * URL to a custom CSS file for theming.
	 * This CSS loads synchronously before React renders, preventing flash of default styles.
	 *
	 * The CSS file should contain shadcn CSS variables (same format as globals.css).
	 *
	 * Trade-offs:
	 * - Pro: No flash of default styles
	 * - Pro: Works in both embedded and full-page modes
	 * - Con: Blocks initial render until CSS loads
	 * - Con: Requires hosting a CSS file at a public URL
	 *
	 * @example "/themes/dark.css" or "https://cdn.myapp.com/auth-theme.css"
	 */
	cssURL?: string | undefined;
	/**
	 * Callback to customize page metadata for SEO and social sharing.
	 * Called for each page request (non-embedded mode only).
	 *
	 * @example
	 * ```typescript
	 * metadata: ({ page }) => ({
	 *   title: `${page} - My App`,
	 *   description: "Secure authentication",
	 *   image: "https://myapp.com/og-auth.png",
	 * })
	 * ```
	 */
	metadata?:
		| ((context: {
				page:
					| "sign-in"
					| "sign-up"
					| "forgot-password"
					| "reset-password"
					| "verify-email"
					| "profile"
					| string;
				path: string;
		  }) => UIPageMetadata | Promise<UIPageMetadata>)
		| undefined;
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
