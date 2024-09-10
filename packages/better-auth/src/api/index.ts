import {
	APIError,
	type Context,
	type Endpoint,
	createRouter,
} from "better-call";
import type { AuthContext } from "../init";
import type { BetterAuthOptions, InferSession, InferUser } from "../types";
import type { Prettify } from "../types/helper";
import { csrfMiddleware } from "./middlewares/csrf";
import {
	callbackOAuth,
	forgetPassword,
	getSession,
	resetPassword,
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

export function getEndpoints<
	C extends AuthContext,
	Option extends BetterAuthOptions,
>(ctx: C, options: Option) {
	const pluginEndpoints = ctx.options.plugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...plugin.endpoints,
			};
		},
		{} as Record<string, any>,
	);

	const middlewares =
		ctx.options.plugins
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

	async function typedSession(
		ctx: Context<
			"/session",
			{
				method: "GET";
				requireHeaders: true;
			}
		>,
	) {
		const handler = await getSession(ctx);
		return handler as {
			session: Prettify<InferSession<Option>>;
			user: Prettify<InferUser<Option>>;
		} | null;
	}
	typedSession.path = getSession.path;
	typedSession.method = getSession.method;
	typedSession.options = getSession.options;
	typedSession.headers = getSession.headers;

	const baseEndpoints = {
		signInOAuth,
		callbackOAuth,
		getCSRFToken,
		getSession: typedSession,
		signOut,
		signUpEmail,
		signInEmail,
		forgetPassword,
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
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
			for (const plugin of ctx.options.plugins || []) {
				if (plugin.hooks?.before) {
					for (const hook of plugin.hooks.before) {
						const match = hook.matcher({
							...context,
							...value,
						});
						if (match) {
							const hookRes = await hook.handler(context);
							if (hookRes && "context" in hookRes) {
								context = {
									...context,
									...hookRes.context,
									...value,
								};
							}
						}
					}
				}
			}
			/**
			 * TODO: move this to respond a json response
			 * instead of response object.
			 */
			//@ts-ignore
			const endpointRes = await value({
				...context,
				context: {
					...ctx,
					...context.context,
				},
			});
			let response = endpointRes;
			for (const plugin of ctx.options.plugins || []) {
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
		api: api as typeof endpoints,
		middlewares,
	};
}

export const router = <C extends AuthContext, Option extends BetterAuthOptions>(
	ctx: C,
	_options: Option,
) => {
	const { api, middlewares } = getEndpoints(ctx, _options);
	const basePath = new URL(ctx.baseURL).pathname;

	return createRouter(api as Omit<typeof api, "error" | "ok" | "welcome">, {
		extraContext: ctx,
		basePath,
		routerMiddleware: [
			{
				path: "/**",
				middleware: csrfMiddleware,
			},
			...middlewares,
		],
		onError(e) {
			console.log(e);
			if (e instanceof APIError) {
				if (e.status === "INTERNAL_SERVER_ERROR") {
					logger.error(e);
				}
			}
		},
	});
};
