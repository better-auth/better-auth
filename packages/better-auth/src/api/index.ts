import { APIError, type Endpoint, createRouter, statusCode } from "better-call";
import type { AuthContext } from "../init";
import type { BetterAuthOptions } from "../types";
import type { UnionToIntersection } from "../types/helper";
import { originCheckMiddleware } from "./middlewares/origin-check";
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
	changeEmail,
	signInEmail,
	signInOAuth,
	signOut,
	verifyEmail,
	linkSocialAccount,
	listUserAccounts,
	changePassword,
	deleteUser,
	setPassword,
	updateUser,
} from "./routes";
import { ok } from "./routes/ok";
import { signUpEmail } from "./routes/sign-up";
import { error } from "./routes/error";
import { logger } from "../utils/logger";
import type { BetterAuthPlugin } from "../plugins";
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
				? T extends {
						endpoints: infer E;
					}
					? E
					: {}
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
		getSession: getSession<Option>(),
		signOut,
		signUpEmail: signUpEmail<Option>(),
		signInEmail,
		forgetPassword,
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
		changeEmail,
		changePassword,
		setPassword,
		updateUser: updateUser<Option>(),
		deleteUser,
		forgetPasswordCallback,
		listSessions: listSessions<Option>(),
		revokeSession,
		revokeSessions,
		linkSocialAccount,
		listUserAccounts,
	};
	const endpoints = {
		...baseEndpoints,
		...pluginEndpoints,
		ok,
		error,
	};
	let api: Record<string, any> = {};
	for (const [key, value] of Object.entries(endpoints)) {
		api[key] = async (context = {} as any) => {
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
									...context?.context,
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
			let endpointRes: any;
			try {
				//@ts-ignore
				endpointRes = await value({
					...context,
					context: {
						...c,
						...context.context,
					},
				});
			} catch (e) {
				if (e instanceof APIError) {
					const afterPlugins = options.plugins
						?.map((plugin) => {
							if (plugin.hooks?.after) {
								return plugin.hooks.after;
							}
						})
						.filter((plugin) => plugin !== undefined)
						.flat();

					if (!afterPlugins?.length) {
						throw e;
					}

					let response = new Response(JSON.stringify(e.body), {
						status: statusCode[e.status],
						headers: e.headers,
					});

					for (const hook of afterPlugins || []) {
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
					return response;
				}
				throw e;
			}
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
				middleware: originCheckMiddleware,
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
			if (options.onAPIError?.throw) {
				throw e;
			}
			if (options.onAPIError?.onError) {
				options.onAPIError.onError(e, ctx);
				return;
			}

			const log = options.logger?.verboseLogging ? logger : undefined;
			if (options.logger?.disabled !== true) {
				if (e instanceof APIError) {
					if (e.status === "INTERNAL_SERVER_ERROR") {
						logger.error(e);
					}
					log?.error(e.message);
				} else {
					logger?.error(e);
				}
			}
		},
	});
};

export * from "./routes";
export * from "./middlewares";
export * from "./call";
export { APIError } from "better-call";
