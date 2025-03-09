export const supportedFrameworks = [
	// front-end
	"next",
	"remix",
	"nuxt",
	"tanstack-start",
	"astro",
	"svelte",
	"solid",
	"vanilla",
	// back-end
	"hono",
	"express",
	"elysia",
	"nitro",
	// Mobile & Desktop
	"expo",
] as const;

export type SupportedFramework = (typeof supportedFrameworks)[number];

export const frameworkLabels: Record<SupportedFramework, string> = {
	astro: "Astro",
	remix: "Remix",
	next: "Next.js",
	nuxt: "Nuxt.js",
	svelte: "Svelte",
	solid: "Solid",
	"tanstack-start": "Tanstack Start",
	vanilla: "Vinilla",

	hono: "Hono",
	express: "Express",
	elysia: "Elysia",
	nitro: "Nitro",

	expo: "Expo",
};


/**
 * A list of frameworks which we support generating auth & auth-client files.
 */
export const currentlySupportedFrameworks = [
	"astro",
	"remix",
	"next",
	"nuxt",
	"svelte",
	"solid",
	"tanstack-start",
	"vanilla",
] as const;

export type CurrentlySupportedFrameworks = (typeof currentlySupportedFrameworks)[number];


/**
 * A list of frameworks which we can generate the API routes for.
 */
export const currentlySupportedApiRouteFrameworks = [
	"astro",
	"remix",
	"next",
	"nuxt",
	"svelte",
	"solid",
	"tanstack-start",
] as const;

export type CurrentlySupportedApiRouteFrameworks = (typeof currentlySupportedApiRouteFrameworks)[number];