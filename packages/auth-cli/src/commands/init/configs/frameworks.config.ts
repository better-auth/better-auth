export const FRAMEWORKS = [
	{
		name: "Astro",
		id: "astro",
		dependency: "astro",
		authClient: {
			importPath: "better-auth/react", // assume react is used for astro
		},
		routeHandler: {
			path: "pages/api/auth/[...all].ts",
			code: `import { auth } from "~/auth";
import type { APIRoute } from "astro";

export const ALL: APIRoute = async (ctx) => {
	// If you want to use rate limiting, make sure to set the 'x-forwarded-for' header to the request headers from the context
	// ctx.request.headers.set("x-forwarded-for", ctx.clientAddress);
	return auth.handler(ctx.request);
};`,
		},
	},
	{
		name: "Remix",
		id: "remix",
		dependency: "@remix-run/server-runtime",
		authClient: {
			importPath: "better-auth/react",
		},
		routeHandler: {
			path: "app/lib/auth.server.ts",
			code: `import { betterAuth } from "better-auth"

export const auth = betterAuth({
    database: {
        provider: "postgres", //change this to your database provider
        url: process.env.DATABASE_URL, // path to your database or connection string
    }
})`,
		},
	},
	{
		name: "Next.js",
		id: "next",
		dependency: "next",
		authClient: {
			importPath: "better-auth/react",
		},
		routeHandler: {
			path: "api/auth/[...all]/route.ts",
			code: `import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth.handler);`,
		},
	},
	{
		name: "Nuxt",
		id: "nuxt",
		dependency: "nuxt",
		authClient: {
			importPath: "better-auth/vue",
		},
		routeHandler: {
			path: "server/api/auth/[...all].ts",
			code: `import { auth } from "~/lib/auth"; // import your auth config

export default defineEventHandler((event) => {
	return auth.handler(toWebRequest(event));
});`,
		},
	},
	{
		name: "SvelteKit",
		id: "sveltekit",
		dependency: "@sveltejs/kit",
		authClient: {
			importPath: "better-auth/svelte",
		},
		routeHandler: {
			path: `hooks.server.ts`,
			code: `import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";

export async function handle({ event, resolve }) {
  return svelteKitHandler({ event, resolve, auth, building });
}`,
		},
	},
	{
		name: "Solid Start",
		id: "solid-start",
		dependency: "solid-start",
		authClient: {
			importPath: "better-auth/solid",
		},
		routeHandler: {
			path: `routes/api/auth/*auth.ts`,
			code: `import { auth } from "~/lib/auth";
import { toSolidStartHandler } from "better-auth/solid-start";

export const { GET, POST } = toSolidStartHandler(auth);`,
		},
	},
	{
		name: "Tanstack Start",
		id: "tanstack-start",
		dependency: "tanstack-start",
		authClient: {
			importPath: "better-auth/react", // assume react is used for tanstack start
		},
		routeHandler: {
			path: `src/routes/api/auth/$.ts`,
			code: `import { auth } from '@/lib/auth'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        return auth.handler(request)
      },
      POST: ({ request }) => {
        return auth.handler(request)
      },
    },
  },
})`,
		},
	},
	{
		name: "Hono",
		id: "hono",
		dependency: "hono",
		authClient: null,
		routeHandler: null,
	},
	{
		name: "Fastify",
		id: "fastify",
		dependency: "fastify",
		authClient: null,
		routeHandler: null,
	},
	{
		name: "Express",
		id: "express",
		dependency: "express",
		authClient: null,
		routeHandler: null,
	},
	{
		name: "Elysia",
		id: "elysia",
		dependency: "elysia",
		authClient: null,
		routeHandler: null,
	},
	{
		name: "Nitro",
		id: "nitro",
		dependency: "nitro",
		authClient: null,
		routeHandler: null,
	},
] as const satisfies {
	name: string;
	id: string;
	dependency: string;
	authClient: {
		importPath: string;
	} | null;
	routeHandler: {
		path: string;
		code: string;
	} | null;
}[];

export type Framework = (typeof FRAMEWORKS)[number];
