import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

/**
 * Tailwind configuration for Better Auth UI.
 *
 * Colors use CSS fallback syntax: var(--primary, var(--ba-primary))
 * - If host app defines --primary, it's used (seamless theme integration)
 * - Otherwise, falls back to --ba-primary (our default theme)
 */
export default {
	darkMode: ["class"],
	content: ["./src/**/*.{ts,tsx}"],
	safelist: ["hidden"],
	theme: {
		extend: {
			colors: {
				border: "var(--border, var(--ba-border))",
				input: "var(--input, var(--ba-input))",
				ring: "var(--ring, var(--ba-ring))",
				background: "var(--background, var(--ba-background))",
				foreground: "var(--foreground, var(--ba-foreground))",
				primary: {
					DEFAULT: "var(--primary, var(--ba-primary))",
					foreground: "var(--primary-foreground, var(--ba-primary-foreground))",
				},
				secondary: {
					DEFAULT: "var(--secondary, var(--ba-secondary))",
					foreground:
						"var(--secondary-foreground, var(--ba-secondary-foreground))",
				},
				destructive: {
					DEFAULT: "var(--destructive, var(--ba-destructive))",
					foreground:
						"var(--destructive-foreground, var(--ba-destructive-foreground))",
				},
				muted: {
					DEFAULT: "var(--muted, var(--ba-muted))",
					foreground: "var(--muted-foreground, var(--ba-muted-foreground))",
				},
				accent: {
					DEFAULT: "var(--accent, var(--ba-accent))",
					foreground: "var(--accent-foreground, var(--ba-accent-foreground))",
				},
				popover: {
					DEFAULT: "var(--popover, var(--ba-popover))",
					foreground: "var(--popover-foreground, var(--ba-popover-foreground))",
				},
				card: {
					DEFAULT: "var(--card, var(--ba-card))",
					foreground: "var(--card-foreground, var(--ba-card-foreground))",
				},
			},
			borderRadius: {
				lg: "var(--radius, var(--ba-radius))",
				md: "calc(var(--radius, var(--ba-radius)) - 2px)",
				sm: "calc(var(--radius, var(--ba-radius)) - 4px)",
			},
			keyframes: {
				"accordion-down": {
					from: { height: "0" },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: "0" },
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
			},
		},
	},
	plugins: [tailwindAnimate],
} satisfies Config;
