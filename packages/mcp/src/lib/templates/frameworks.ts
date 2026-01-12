import type { Framework, FrameworkConfig } from "../types.js";

export const FRAMEWORK_CONFIGS: Record<Framework, FrameworkConfig> = {
	"next-app-router": {
		name: "Next.js (App Router)",
		defaultSrcDir: false,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "app/api/auth/[...all]",
		clientImport: 'import { createAuthClient } from "better-auth/react";',
		handlerImport: 'import { toNextJsHandler } from "better-auth/next-js";',
		handlerFunction: "toNextJsHandler",
		apiRouteTemplate: (
			authPath: string,
		) => `import { auth } from "@/${authPath}";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);`,
		defaultPort: 3000,
	},
	"next-pages-router": {
		name: "Next.js (Pages Router)",
		defaultSrcDir: false,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "pages/api/auth/[...all]",
		clientImport: 'import { createAuthClient } from "better-auth/react";',
		handlerImport: 'import { toNodeHandler } from "better-auth/node";',
		handlerFunction: "toNodeHandler",
		apiRouteTemplate: (
			authPath: string,
		) => `import { toNodeHandler } from "better-auth/node";
import { auth } from "@/${authPath}";

export const config = { api: { bodyParser: false } };
export default toNodeHandler(auth);`,
		defaultPort: 3000,
	},
	sveltekit: {
		name: "SvelteKit",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "routes/api/auth/[...all]",
		clientImport: 'import { createAuthClient } from "better-auth/svelte";',
		handlerImport: 'import { svelteKitHandler } from "better-auth/svelte-kit";',
		handlerFunction: "svelteKitHandler",
		apiRouteTemplate: () => "",
		hooksTemplate: (authPath: string) => `import { auth } from "$${authPath}";
import { svelteKitHandler } from "better-auth/svelte-kit";
import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  return svelteKitHandler({ event, resolve, auth });
};`,
		defaultPort: 5173,
	},
	astro: {
		name: "Astro",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "pages/api/auth/[...all]",
		clientImport: 'import { createAuthClient } from "better-auth/client";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (
			authPath: string,
		) => `import type { APIRoute } from "astro";
import { auth } from "@/${authPath}";

export const GET: APIRoute = async (ctx) => {
  return auth.handler(ctx.request);
};

export const POST: APIRoute = async (ctx) => {
  return auth.handler(ctx.request);
};`,
		defaultPort: 4321,
	},
	remix: {
		name: "Remix",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "routes/api.auth.$",
		clientImport: 'import { createAuthClient } from "better-auth/react";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (
			authPath: string,
		) => `import { auth } from "~/${authPath}";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  return auth.handler(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return auth.handler(request);
}`,
		defaultPort: 3000,
	},
	nuxt: {
		name: "Nuxt 3",
		defaultSrcDir: false,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "server/api/auth/[...all]",
		clientImport: 'import { createAuthClient } from "better-auth/vue";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (
			authPath: string,
		) => `import { auth } from "~/${authPath}";

export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event));
});`,
		defaultPort: 3000,
	},
	"solid-start": {
		name: "SolidStart",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "routes/api/auth/[...all]",
		clientImport: 'import { createAuthClient } from "better-auth/solid";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (
			authPath: string,
		) => `import { auth } from "~/${authPath}";
import type { APIEvent } from "@solidjs/start/server";

export async function GET(event: APIEvent) {
  return auth.handler(event.request);
}

export async function POST(event: APIEvent) {
  return auth.handler(event.request);
}`,
		defaultPort: 3000,
	},
	hono: {
		name: "Hono",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "",
		clientImport: 'import { createAuthClient } from "better-auth/client";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (authPath: string) => `import { Hono } from "hono";
import { auth } from "./${authPath}";

const app = new Hono();

app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

export default app;`,
		defaultPort: 3000,
	},
	express: {
		name: "Express.js",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "",
		clientImport: 'import { createAuthClient } from "better-auth/client";',
		handlerImport: 'import { toNodeHandler } from "better-auth/node";',
		handlerFunction: "toNodeHandler",
		apiRouteTemplate: (authPath: string) => `import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./${authPath}";

const app = express();

app.all("/api/auth/*", toNodeHandler(auth));

app.listen(3000, () => {
  console.log("Server running on port 3000");
});`,
		defaultPort: 3000,
	},
	fastify: {
		name: "Fastify",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "",
		clientImport: 'import { createAuthClient } from "better-auth/client";',
		handlerImport: 'import { toNodeHandler } from "better-auth/node";',
		handlerFunction: "toNodeHandler",
		apiRouteTemplate: (authPath: string) => `import Fastify from "fastify";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./${authPath}";

const fastify = Fastify();

fastify.all("/api/auth/*", async (request, reply) => {
  const handler = toNodeHandler(auth);
  return handler(request.raw, reply.raw);
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err;
  console.log("Server running on port 3000");
});`,
		defaultPort: 3000,
	},
	elysia: {
		name: "Elysia (Bun)",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "",
		clientImport: 'import { createAuthClient } from "better-auth/client";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (authPath: string) => `import { Elysia } from "elysia";
import { auth } from "./${authPath}";

const app = new Elysia()
  .all("/api/auth/*", ({ request }) => auth.handler(request))
  .listen(3000);

console.log("Server running on port 3000");`,
		defaultPort: 3000,
	},
	"tanstack-start": {
		name: "TanStack Start",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "routes/api/auth.$",
		clientImport: 'import { createAuthClient } from "better-auth/react";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: (
			authPath: string,
		) => `import { auth } from "~/${authPath}";
import { createAPIFileRoute } from "@tanstack/start/api";

export const Route = createAPIFileRoute("/api/auth/$")({
  GET: ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
});`,
		defaultPort: 3000,
	},
	expo: {
		name: "Expo (React Native)",
		defaultSrcDir: true,
		defaultAuthPath: "lib/auth",
		defaultApiPath: "",
		clientImport: 'import { createAuthClient } from "@better-auth/expo";',
		handlerImport: "",
		handlerFunction: "",
		apiRouteTemplate: () => "",
		defaultPort: 8081,
	},
};

export function getDefaultAuthPath(
	framework: Framework,
	srcDir: boolean,
): string {
	const config = FRAMEWORK_CONFIGS[framework];
	const basePath = config.defaultAuthPath;

	if (srcDir && !config.defaultSrcDir) {
		return `src/${basePath}`;
	}
	if (!srcDir && config.defaultSrcDir) {
		return basePath;
	}
	return config.defaultSrcDir ? `src/${basePath}` : basePath;
}

export function getDefaultApiPath(
	framework: Framework,
	srcDir: boolean,
): string {
	const config = FRAMEWORK_CONFIGS[framework];
	const basePath = config.defaultApiPath;

	if (!basePath) return "";

	if (srcDir && !config.defaultSrcDir) {
		return `src/${basePath}`;
	}
	return config.defaultSrcDir ? `src/${basePath}` : basePath;
}
