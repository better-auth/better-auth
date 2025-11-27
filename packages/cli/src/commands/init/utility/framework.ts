import { hasDependency } from "./get-package-json";

export const FRAMEWORKS = [
	{
		name: "Astro",
		id: "astro",
		dependency: "astro",
		authClient: {
			importPath: "better-auth/react", // assume react is used for astro
		},
	},
	{
		name: "Remix",
		id: "remix",
		dependency: "@remix-run/server-runtime",
		authClient: {
			importPath: "better-auth/react",
		},
	},
	{
		name: "Next.js",
		id: "next",
		dependency: "next",
		authClient: {
			importPath: "better-auth/react",
		},
	},
	{
		name: "Nuxt",
		id: "nuxt",
		dependency: "nuxt",
		authClient: {
			importPath: "better-auth/vue",
		},
	},
	{
		name: "SvelteKit",
		id: "sveltekit",
		dependency: "@sveltejs/kit",
		authClient: {
			importPath: "better-auth/svelte",
		},
	},
	{
		name: "Solid Start",
		id: "solid-start",
		dependency: "solid-start",
		authClient: {
			importPath: "better-auth/solid",
		},
	},
	{
		name: "Tanstack Start",
		id: "tanstack-start",
		dependency: "tanstack-start",
		authClient: {
			importPath: "better-auth/react", // assume react is used for tanstack start
		},
	},
	{
		name: "Hono",
		id: "hono",
		dependency: "hono",
		authClient: null,
	},
	{
		name: "Fastify",
		id: "fastify",
		dependency: "fastify",
		authClient: null,
	},
	{
		name: "Express",
		id: "express",
		dependency: "express",
		authClient: null,
	},
	{
		name: "Elysia",
		id: "elysia",
		dependency: "elysia",
		authClient: null,
	},
	{
		name: "Nitro",
		id: "nitro",
		dependency: "nitro",
		authClient: null,
	},
] as const satisfies {
	name: string;
	id: string;
	dependency: string;
	authClient: {
		importPath: string;
	} | null;
}[];

export type Framework = (typeof FRAMEWORKS)[number];

/**
 * Attempt to auto-detect the web-framework based on information provided in the CWD.
 * @param cwd The current working directory of the project.
 * @returns The detected framework or null if no framework could be detected.
 */
export const autoDetectFramework = async (
	cwd: string,
): Promise<Framework | null> => {
	let framework: Framework | null = null;

	for (const i of FRAMEWORKS) {
		const hasDep = await hasDependency(cwd, i.dependency);
		if (hasDep) {
			framework = i;
			break;
		}
	}

	return framework;
};
