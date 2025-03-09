import { log } from "@clack/prompts";
import type { Step } from "../types";
import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import {
	frameworkLabels,
	type CurrentlySupportedApiRouteFrameworks,
	type CurrentlySupportedFrameworks,
} from "../supported-frameworks";

export const generateAuthApiRoute: Step<
	[framework: CurrentlySupportedFrameworks]
> = {
	id: "generate-auth-api-route",
	description: "Generate auth API route for your framework",
	exec: async (helpers, options, framework) => {
		const hasSrc = readdirSync(options.cwd).includes("src");

		if (framework === "vanilla") {
			log.warn(
				"We do not support generating an API routes for vanilla / non-frameworks. You will need to configure this yourself.",
			);
			return {
				result: {
					state: "failure",
					data: null,
					message: null,
					error: null,
				},
				shouldContinue: true,
			};
		}

		const { routePath, code, fallbackFullPath, fileName } =
			apiRoutes[framework];

		let fullAPIRoutePath = path.join(
			options.cwd,
			hasSrc ? `src` : "",
			routePath,
		);
		const root_path = path.join(fullAPIRoutePath, fileName);
		if (existsSync(root_path)) {
			log.info(`Found API Route file. ${chalk.gray(`(${root_path})`)}`);
			return {
				result: {
					state: "skipped",
					data: null,
					error: null,
					message: `${chalk.yellowBright(
						"Skipped",
					)} generating auth API route for ${frameworkLabels[framework]}.`,
				},
				shouldContinue: true,
			};
		}


		const runtime_data = helpers.getRuntimeData();

		let currentAuthPath = runtime_data.authConfigPath
			? getRelativePath(fullAPIRoutePath, runtime_data.authConfigPath)
			: fallbackFullPath;

		const authRouteFile = await helpers.format(
			code({ authConfigPath: currentAuthPath.replace(/\.[tsxj]+/gm, "") }),
		);
		mkdirSync(path.dirname(root_path), { recursive: true });
		writeFileSync(root_path, authRouteFile);

		log.info(chalk.gray(`${chalk.bold(`Auth API route:`)} ${root_path}`));

		return {
			result: {
				state: "success",
				data: null,
				error: null,
				message: `${chalk.greenBright(
					"Successfully",
				)} generated your auth API route for ${frameworkLabels[framework]}.`,
			},
			shouldContinue: true,
		};
	},
};

function getRelativePath(
	currentAbsolutePath: string,
	targetAbsolutePath: string,
) {
	const relativePath = path.relative(currentAbsolutePath, targetAbsolutePath);

	return relativePath;
}

const apiRoutes: Record<
	CurrentlySupportedApiRouteFrameworks,
	{
		routePath: string;
		fileName: string;
		fallbackFullPath: string;
		code: ({ authConfigPath }: { authConfigPath: string }) => string;
	}
> = {
	next: {
		routePath: "app/api/auth/[...all]",
		fileName: "route.ts",
		fallbackFullPath: "@/lib/auth.ts",
		code: ({ authConfigPath }) => {
			return [
				`import { auth } from "${authConfigPath}";`,
				`import { toNextJsHandler } from "better-auth/next-js";`,
				``,
				`export const { POST, GET } = toNextJsHandler(auth);`,
			].join("\n");
		},
	},
	nuxt: {
		fileName: "[...all].ts",
		routePath: `server/api/auth/`,
		fallbackFullPath: `~/utils/auth`,
		code: ({ authConfigPath }) => {
			return [
				`import { auth } from "${authConfigPath}";`,
				``,
				`export default defineEventHandler((event) => {`,
				`return auth.handler(toWebRequest(event));`,
				`});`,
			].join("\n");
		},
	},
	svelte: {
		routePath: "",
		fallbackFullPath: "$lib/auth",
		fileName: "hooks.server.ts",
		code: ({ authConfigPath }) => {
			return [
				`import { auth } from "${authConfigPath}";`,
				`import { svelteKitHandler } from "better-auth/svelte-kit";`,
				``,
				`export async function handle({ event, resolve }) {`,
				`return svelteKitHandler({ event, resolve, auth });`,
				`}`,
			].join("\n");
		},
	},
	remix: {
		routePath: "/app/routes/",
		fallbackFullPath: `~/lib/auth.server`,
		fileName: "api.auth.$.ts",
		code({ authConfigPath }) {
			return [
				`import { auth } from "${authConfigPath}";`,
				`import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node"`,
				``,
				`export async function loader({ request }: LoaderFunctionArgs) {`,
				`return auth.handler(request)`,
				`}`,
				``,
				`export async function action({ request }: ActionFunctionArgs) {`,
				`return auth.handler(request)`,
				`}`,
			].join("\n");
		},
	},
	solid: {
		routePath: `/routes/api/auth`,
		fileName: `*all.ts`,
		fallbackFullPath: `~/lib/auth`,
		code({ authConfigPath }) {
			return [
				`import { auth } from "${authConfigPath}";`,
				`import { toSolidStartHandler } from "better-auth/solid-start";`,
				``,
				`export const { GET, POST } = toSolidStartHandler(auth);`,
			].join("\n");
		},
	},
	"tanstack-start": {
		routePath: `app/routes/api/auth`,
		fileName: `$.ts`,
		fallbackFullPath: `~/lib/server/auth`,
		code({ authConfigPath }) {
			return [
				`import { auth } from "${authConfigPath}";`,
				`import { createAPIFileRoute } from '@tanstack/start/api';`,
				``,
				`export const APIRoute = createAPIFileRoute('/api/auth/$')({`,
				`GET: ({ request }) => {`,
				`return auth.handler(request)`,
				`},`,
				`POST: ({ request }) => {`,
				`return auth.handler(request)`,
				`},`,
				`});`,
			].join("\n");
		},
	},
	astro: {
		routePath: `pages/api/auth`,
		fileName: `[...all].ts`,
		fallbackFullPath: `~/lib/auth`,
		code({ authConfigPath }) {
			return [
				`import { auth } from "${authConfigPath}";`,
				`import type { APIRoute } from "astro";`,
				``,
				`export const ALL: APIRoute = async (ctx) => {`,
				`return auth.handler(ctx.request);`,
				`};`,
			].join("\n");
		},
	},
};
