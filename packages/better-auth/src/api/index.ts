import { APIError, type Endpoint, createRouter } from "better-call";
import type { AuthContext } from "../init";
import type { BetterAuthOptions } from "../types";
import type { UnionToIntersection } from "../types/helper";
import { csrfMiddleware } from "./middlewares/csrf";
import {
	callbackOAuth,
	forgetPassword,
	forgetPasswordCallback,
	getSession,
	listSessions,
	resetPassword,
	revokeSession,
	revokeSessions,
	sendVerificationEmail,
	signInEmail,
	signInOAuth,
	signOut,
	verifyEmail,
} from "./routes";
import { getCSRFToken } from "./routes/csrf";
import { ok } from "./routes/ok";
import { signUpEmail } from "./routes/sign-up";
import { error } from "./routes/error";
import { logger } from "../utils/logger";
import {
	changePassword,
	deleteUser,
	setPassword,
	updateUser,
} from "./routes/update-user";
import type { BetterAuthPlugin } from "../plugins";
import chalk from "chalk";
import { onRequestRateLimit } from "./rate-limiter";

export function getEndpoints<
	C extends AuthContext,
	Option extends BetterAuthOptions,
>(ctx: Promise<C> | C, options: Option) {
	const pluginEndpoints = options.plugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...plugin.endpoints,
			};
		},
		{} as Record<string, any>,
	);

	type PluginEndpoint = UnionToIntersection<
		Option["plugins"] extends Array<infer T>
			? T extends BetterAuthPlugin
				? T["endpoints"]
				: {}
			: {}
	>;

	const middlewares =
		options.plugins
			?.map((plugin) =>
				plugin.middlewares?.map((m) => {
					const middleware = (async (context: any) => {
						return m.middleware({
							...context,
							context: {
								...ctx,
								...context.context,
							},
						});
					}) as Endpoint;
					middleware.path = m.path;
					middleware.options = m.middleware.options;
					middleware.headers = m.middleware.headers;
					return {
						path: m.path,
						middleware,
					};
				}),
			)
			.filter((plugin) => plugin !== undefined)
			.flat() || [];

	const baseEndpoints = {
		signInOAuth,
		callbackOAuth,
		getCSRFToken,
		getSession: getSession<Option>(),
		signOut,
		signUpEmail: signUpEmail<Option>(),
		signInEmail,
		forgetPassword,
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
		changePassword,
		setPassword,
		updateUser,
		deleteUser,
		forgetPasswordCallback,
		listSessions: listSessions<Option>(),
		revokeSession,
		revokeSessions,
	};
	const endpoints = {
		...baseEndpoints,
		...pluginEndpoints,
		ok,
		error,
	};
	let api: Record<string, any> = {};
	for (const [key, value] of Object.entries(endpoints)) {
		api[key] = async (context: any) => {
			let c = await ctx;
			for (const plugin of options.plugins || []) {
				if (plugin.hooks?.before) {
					for (const hook of plugin.hooks.before) {
						const match = hook.matcher({
							...value,
							...context,
							context: c,
						});
						if (match) {
							const hookRes = await hook.handler({
								...context,
								context: {
									...c,
									...context.context,
								},
							});
							if (hookRes && "context" in hookRes) {
								c = {
									...c,
									...hookRes.context,
								};
							}
						}
					}
				}
			}

			//@ts-ignore
			const endpointRes = await value({
				...context,
				context: {
					...c,
					...context.context,
				},
			});
			let response = endpointRes;
			for (const plugin of options.plugins || []) {
				if (plugin.hooks?.after) {
					for (const hook of plugin.hooks.after) {
						const match = hook.matcher(context);
						if (match) {
							const obj = Object.assign(context, {
								context: {
									...ctx,
									returned: response,
								},
							});
							const hookRes = await hook.handler(obj);
							if (hookRes && "response" in hookRes) {
								response = hookRes.response as any;
							}
						}
					}
				}
			}
			return response;
		};
		api[key].path = value.path;
		api[key].method = value.method;
		api[key].options = value.options;
		api[key].headers = value.headers;
	}
	return {
		api: api as typeof endpoints & PluginEndpoint,
		middlewares,
	};
}

export const router = <C extends AuthContext, Option extends BetterAuthOptions>(
	ctx: C,
	options: Option,
) => {
	const { api, middlewares } = getEndpoints(ctx, options);
	const basePath = new URL(ctx.baseURL).pathname;

	return createRouter(api, {
		extraContext: ctx,
		basePath,
		routerMiddleware: [
			{
				path: "/**",
				middleware: csrfMiddleware,
			},
			...middlewares,
		],
		async onRequest(req) {
			for (const plugin of ctx.options.plugins || []) {
				if (plugin.onRequest) {
					const response = await plugin.onRequest(req, ctx);
					if (response) {
						return response;
					}
				}
			}
			return onRequestRateLimit(req, ctx);
		},
		async onResponse(res) {
			for (const plugin of ctx.options.plugins || []) {
				if (plugin.onResponse) {
					const response = await plugin.onResponse(res, ctx);
					if (response) {
						return response.response;
					}
				}
			}
			return res;
		},
		onError(e) {
			const log = options.logger?.verboseLogging ? logger : undefined;
			if (options.logger?.disabled !== true) {
				if (e instanceof APIError) {
					if (e.status === "INTERNAL_SERVER_ERROR") {
						logger.error(e);
					}
					log?.error(e.message);
				} else {
					if (typeof e === "object" && e !== null && "message" in e) {
						const errorMessage = e.message as string;
						if (!errorMessage || typeof errorMessage !== "string") {
							log?.error(e);
							return;
						}
						if (errorMessage.includes("no such table")) {
							logger?.error(
								`Please run ${chalk.green(
									"npx better-auth migrate",
								)} to create the tables. There are missing tables in your SQLite database.`,
							);
						} else if (
							errorMessage.includes("relation") &&
							errorMessage.includes("does not exist")
						) {
							logger.error(
								`Please run ${chalk.green(
									"npx better-auth migrate",
								)} to create the tables. There are missing tables in your PostgreSQL database.`,
							);
						} else if (
							errorMessage.includes("Table") &&
							errorMessage.includes("doesn't exist")
						) {
							logger?.error(
								`Please run ${chalk.green(
									"npx better-auth migrate",
								)} to create the tables. There are missing tables in your MySQL database.`,
							);
						} else {
							log?.error(e);
						}
					} else {
						log?.error(e);
					}
				}
			}
		},
	});
};

export * from "./routes";
export * from "./middlewares";
export * from "./call";
export { APIError } from "better-call";
