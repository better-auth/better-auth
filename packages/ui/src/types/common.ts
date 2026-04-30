/**
 * HSL color value (e.g., "222.2 84% 4.9%" without the hsl() wrapper)
 * This matches shadcn's CSS variable format
 */
export type HSLColor = string;

/**
 * shadcn-compatible theme configuration for UI pages.
 * All color values should be HSL values without the hsl() wrapper.
 * Example: "222.2 84% 4.9%"
 */
export interface UITheme {
	/** Background color for the page */
	background?: HSLColor;
	/** Foreground/text color */
	foreground?: HSLColor;
	/** Card background color */
	card?: HSLColor;
	/** Card foreground color */
	cardForeground?: HSLColor;
	/** Popover background color */
	popover?: HSLColor;
	/** Popover foreground color */
	popoverForeground?: HSLColor;
	/** Primary color for buttons and interactive elements */
	primary?: HSLColor;
	/** Primary foreground color (text on primary) */
	primaryForeground?: HSLColor;
	/** Secondary color for secondary buttons */
	secondary?: HSLColor;
	/** Secondary foreground color */
	secondaryForeground?: HSLColor;
	/** Muted color for disabled states */
	muted?: HSLColor;
	/** Muted foreground color */
	mutedForeground?: HSLColor;
	/** Accent color for highlights */
	accent?: HSLColor;
	/** Accent foreground color */
	accentForeground?: HSLColor;
	/** Destructive/error color */
	destructive?: HSLColor;
	/** Destructive foreground color */
	destructiveForeground?: HSLColor;
	/** Border color */
	border?: HSLColor;
	/** Input border color */
	input?: HSLColor;
	/** Focus ring color */
	ring?: HSLColor;
	/** Border radius in rem (e.g., "0.5") */
	radius?: string;
	/** Font family */
	fontFamily?: string;
	/** Dark mode theme overrides */
	dark?: Omit<UITheme, "dark" | "radius" | "fontFamily">;
}

/**
 * Social provider configuration for UI pages
 */
export interface SocialProvider {
	id: string;
	name: string;
	icon?: string;
}

/**
 * Base options shared by all pages
 */
export interface BasePageOptions {
	/** Application name */
	appName?: string;
	/** Logo URL */
	logo?: string;
	/** Base URL for API calls */
	apiBaseUrl?: string;
	/** Theme configuration */
	theme?: UITheme;
}
