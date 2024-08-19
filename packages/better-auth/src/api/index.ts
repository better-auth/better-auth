import { createRouter } from "better-call";
import {
	signInOAuth,
	callbackOAuth,
	getSession,
	signOut,
	signInCredential,
} from "./routes";
import { AuthContext } from "../init";
import { csrfMiddleware } from "./middlewares/csrf";
import { getCSRFToken } from "./routes/csrf";
import { signUpCredential } from "./routes/signup";

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

	const baseEndpoints = {
		signInOAuth,
		callbackOAuth,
		getCSRFToken,
		getSession,
		signOut,
		signUpCredential,
		signInCredential,
	};
	const endpoints = {
		...baseEndpoints,
		...providerEndpoints,
		...pluginEndpoints,
	};

	return createRouter(endpoints as typeof baseEndpoints, {
		extraContext: ctx,
		basePath: ctx.options.basePath,
		routerMiddleware: [
			{
				path: "/**",
				middleware: csrfMiddleware,
			},
		],
	});
};
