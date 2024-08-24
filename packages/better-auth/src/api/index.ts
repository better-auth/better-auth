import { createRouter, Endpoint } from "better-call";
import {
	signInOAuth,
	callbackOAuth,
	getSession,
	signOut,
	signInCredential,
	forgetPassword,
	resetPassword,
	verifyEmail,
	sendVerificationEmail,
} from "./routes";
import { AuthContext } from "../init";
import { csrfMiddleware } from "./middlewares/csrf";
import { getCSRFToken } from "./routes/csrf";
import { signUpCredential } from "./routes/sign-up";
import { parseAccount, parseSession, parseUser } from "../adapters/schema";

export const router = <C extends AuthContext>(ctx: C) => {
	const pluginEndpoints = ctx.options.plugins?.reduce(
		(acc, plugin) => {
			return {
				...acc,
				...plugin.endpoints,
			};
		},
		{} as Record<string, any>,
	);

	const providerEndpoints = ctx.options.providers?.reduce(
		(acc, provider) => {
			if (provider.type === "custom") {
				return {
					...acc,
					...provider.endpoints,
				};
			}
			return acc;
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

	const baseEndpoints = {
		signInOAuth,
		callbackOAuth,
		getCSRFToken,
		getSession,
		signOut,
		signUpCredential,
		signInCredential,
		forgetPassword,
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
	};
	const endpoints = {
		...baseEndpoints,
		...providerEndpoints,
		...pluginEndpoints,
	};
	let api: Record<string, any> = {};
	for (const [key, value] of Object.entries(endpoints)) {
		api[key] = (context: any) => {
			//@ts-ignore
			return value({
				...context,
				context: {
					...ctx,
					...context.context,
				},
			});
		};
		api[key].path = value.path;
		api[key].method = value.method;
		api[key].options = value.options;
		api[key].headers = value.headers;
	}
	return createRouter(api as typeof baseEndpoints, {
		extraContext: ctx,
		basePath: ctx.options.basePath,
		routerMiddleware: [
			{
				path: "/**",
				middleware: csrfMiddleware,
			},
			...middlewares,
		],
		/**
		 * this is to remove any sensitive data from the response
		 */
		async transformResponse(res) {
			let body: Record<string, any> = {};
			try {
				body = await res.json();
			} catch (e) {}
			if (body?.user) {
				body.user = parseUser(ctx.options, body.user);
			}
			if (body?.session) {
				body.session = parseSession(ctx.options, body.session);
			}
			if (body?.account) {
				body.account = parseAccount(ctx.options, body.account);
			}
			return new Response(body ? JSON.stringify(body) : null, {
				headers: res.headers,
				status: res.status,
				statusText: res.statusText,
			});
		},
	});
};
