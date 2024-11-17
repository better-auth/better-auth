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
	signInSocial,
	signOut,
	verifyEmail,
	linkSocialAccount,
	revokeOtherSessions,
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
		signInSocial,
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
		revokeOtherSessions,
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
	for (const [key, endpointOptions] of Object.entries(endpoints)) {
		api[key] = async (context = {} as any) => {
			let authCtx = await ctx;
			// clear session so it doesn't persist between requests
			authCtx.session = null;
			for (const plugin of options.plugins || []) {
				if (plugin.hooks?.before) {
					for (const hook of plugin.hooks.before) {
						const ctx = {
							...endpointOptions,
							...context,
							context: {
								...authCtx,
								...context?.context,
							},
						};
						const match = hook.matcher(ctx);
						if (match) {
							const hookRes = await hook.handler(ctx);
							if (hookRes && "context" in hookRes) {
								context = {
									...hookRes,
									...context,
								};
							}
						}
					}
				}
			}
			let endpointRes: any;
			try {
				//@ts-ignore
				endpointRes = await endpointOptions({
					...context,
					context: {
						...authCtx,
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

					let pluginResponse: Request | undefined = undefined;

					for (const hook of afterPlugins || []) {
						const match = hook.matcher(context);
						if (match) {
							// @ts-expect-error - returned is not in the context type
							c.returned = response;
							const ctx = {
								...endpointOptions,
								...context,
								context: {
									...authCtx,
									...context.context,
									endpoint: endpointOptions,
									returned: response,
								},
							};
							const hookRes = await hook.handler(ctx);
							if (hookRes && "response" in hookRes) {
								pluginResponse = hookRes.response as any;
							}
						}
					}
					if (pluginResponse instanceof Response) {
						return pluginResponse;
					}
					throw e;
				}
				throw e;
			}
			let response = endpointRes;
			for (const plugin of options.plugins || []) {
				if (plugin.hooks?.after) {
					for (const hook of plugin.hooks.after) {
						const ctx = {
							...endpointOptions,
							...context,
							context: {
								...authCtx,
								...context.context,
								endpoint: endpointOptions,
								returned: response,
							},
						};
						const match = hook.matcher(ctx);
						if (match) {
							const hookRes = await hook.handler(ctx);
							if (hookRes) {
								if ("response" in hookRes) {
									response = hookRes.response as any;
								}
								if ("responseHeader" in hookRes) {
									if (response instanceof Response) {
										response = new Response(response.body, {
											status: response.status,
											headers: {
												...response.headers,
												...hookRes.responseHeader,
											},
										});
									} else {
										api[key].headers = hookRes.responseHeader;
									}
								}
							}
						}
					}
				}
			}

			return response;
		};
		api[key].path = endpointOptions.path;
		api[key].method = endpointOptions.method;
		api[key].options = endpointOptions.options;
		api[key].headers = endpointOptions.headers;
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
					if (response && "response" in response) {
						return response.response;
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
			if (e instanceof APIError && e.status === "FOUND") {
				return;
			}
			if (options.onAPIError?.throw) {
				throw e;
			}
			if (options.onAPIError?.onError) {
				options.onAPIError.onError(e, ctx);
				return;
			}

			if (
				e &&
				typeof e === "object" &&
				"message" in e &&
				typeof e.message === "string"
			) {
				if (
					e.message.includes("no column") ||
					e.message.includes("column") ||
					e.message.includes("relation") ||
					e.message.includes("table") ||
					e.message.includes("does not exist")
				) {
					logger.error(e.message);
					logger.error(
						"If you are seeing this error, it is likely that you need to run the migrations for the database or you need to update your database schema. If you recently updated the package, make sure to run the migrations.",
					);
					return;
				}
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
