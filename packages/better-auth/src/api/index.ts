import type {
	AuthContext,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { InternalLogger } from "@better-auth/core/env";
import { logger } from "@better-auth/core/env";
import type { Endpoint, Middleware } from "better-call";
import { APIError, createRouter } from "better-call";
import type { UnionToIntersection } from "../types/helper";
import { originCheckMiddleware } from "./middlewares";
import { onRequestRateLimit } from "./rate-limiter";
import {
	accountInfo,
	callbackOAuth,
	changeEmail,
	changePassword,
	deleteUser,
	deleteUserCallback,
	error,
	getAccessToken,
	getSession,
	linkSocialAccount,
	listSessions,
	listUserAccounts,
	ok,
	refreshToken,
	requestPasswordReset,
	requestPasswordResetCallback,
	resetPassword,
	revokeOtherSessions,
	revokeSession,
	revokeSessions,
	sendVerificationEmail,
	setPassword,
	signInEmail,
	signInSocial,
	signOut,
	signUpEmail,
	unlinkAccount,
	updateUser,
	verifyEmail,
} from "./routes";
import { toAuthEndpoints } from "./to-auth-endpoints";

export function checkEndpointConflicts(
	options: BetterAuthOptions,
	logger: InternalLogger,
) {
	const endpointRegistry = new Map<
		string,
		{ pluginId: string; endpointKey: string; methods: string[] }[]
	>();

	options.plugins?.forEach((plugin) => {
		if (plugin.endpoints) {
			for (const [key, endpoint] of Object.entries(plugin.endpoints)) {
				if (endpoint && "path" in endpoint) {
					const path = endpoint.path;
					let methods: string[] = [];
					if (endpoint.options && "method" in endpoint.options) {
						if (Array.isArray(endpoint.options.method)) {
							methods = endpoint.options.method;
						} else if (typeof endpoint.options.method === "string") {
							methods = [endpoint.options.method];
						}
					}
					if (methods.length === 0) {
						methods = ["*"];
					}

					if (!endpointRegistry.has(path)) {
						endpointRegistry.set(path, []);
					}
					endpointRegistry.get(path)!.push({
						pluginId: plugin.id,
						endpointKey: key,
						methods,
					});
				}
			}
		}
	});

	const conflicts: {
		path: string;
		plugins: string[];
		conflictingMethods: string[];
	}[] = [];
	for (const [path, entries] of endpointRegistry.entries()) {
		if (entries.length > 1) {
			const methodMap = new Map<string, string[]>();
			let hasConflict = false;

			for (const entry of entries) {
				for (const method of entry.methods) {
					if (!methodMap.has(method)) {
						methodMap.set(method, []);
					}
					methodMap.get(method)!.push(entry.pluginId);

					if (methodMap.get(method)!.length > 1) {
						hasConflict = true;
					}

					if (method === "*" && entries.length > 1) {
						hasConflict = true;
					} else if (method !== "*" && methodMap.has("*")) {
						hasConflict = true;
					}
				}
			}

			if (hasConflict) {
				const uniquePlugins = [...new Set(entries.map((e) => e.pluginId))];
				const conflictingMethods: string[] = [];

				for (const [method, plugins] of methodMap.entries()) {
					if (
						plugins.length > 1 ||
						(method === "*" && entries.length > 1) ||
						(method !== "*" && methodMap.has("*"))
					) {
						conflictingMethods.push(method);
					}
				}

				conflicts.push({
					path,
					plugins: uniquePlugins,
					conflictingMethods,
				});
			}
		}
	}

	if (conflicts.length > 0) {
		const conflictMessages = conflicts
			.map(
				(conflict) =>
					`  - "${conflict.path}" [${conflict.conflictingMethods.join(", ")}] used by plugins: ${conflict.plugins.join(", ")}`,
			)
			.join("\n");
		logger.error(
			`Endpoint path conflicts detected! Multiple plugins are trying to use the same endpoint paths with conflicting HTTP methods:
${conflictMessages}

To resolve this, you can:
	1. Use only one of the conflicting plugins
	2. Configure the plugins to use different paths (if supported)
	3. Ensure plugins use different HTTP methods for the same path
`,
		);
	}
}

export function getEndpoints<Option extends BetterAuthOptions>(
	ctx: Promise<AuthContext> | AuthContext,
	options: Option,
) {
	const pluginEndpoints =
		options.plugins?.reduce<Record<string, Endpoint>>((acc, plugin) => {
			return {
				...acc,
				...plugin.endpoints,
			};
		}, {}) ?? {};

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
						const authContext = await ctx;
						return m.middleware({
							...context,
							context: {
								...authContext,
								...context.context,
							},
						});
					}) as Middleware;
					middleware.options = m.middleware.options;
					return {
						path: m.path,
						middleware,
					};
				}),
			)
			.filter((plugin) => plugin !== undefined)
			.flat() || [];

	const baseEndpoints = {
		signInSocial: signInSocial<Option>(),
		callbackOAuth,
		getSession: getSession<Option>(),
		signOut,
		signUpEmail: signUpEmail<Option>(),
		signInEmail: signInEmail<Option>(),
		resetPassword,
		verifyEmail,
		sendVerificationEmail,
		changeEmail,
		changePassword,
		setPassword,
		updateUser: updateUser<Option>(),
		deleteUser,
		requestPasswordReset,
		requestPasswordResetCallback,
		listSessions: listSessions<Option>(),
		revokeSession,
		revokeSessions,
		revokeOtherSessions,
		linkSocialAccount,
		listUserAccounts,
		deleteUserCallback,
		unlinkAccount,
		refreshToken,
		getAccessToken,
		accountInfo,
	};
	const endpoints = {
		...baseEndpoints,
		...pluginEndpoints,
		ok,
		error,
	} as const;
	const api = toAuthEndpoints(endpoints, ctx);
	return {
		api: api as typeof endpoints & PluginEndpoint,
		middlewares,
	};
}
export const router = <Option extends BetterAuthOptions>(
	ctx: AuthContext,
	options: Option,
) => {
	const { api, middlewares } = getEndpoints(ctx, options);
	const basePath = new URL(ctx.baseURL).pathname;

	return createRouter(api, {
		routerContext: ctx,
		openapi: {
			disabled: true,
		},
		basePath,
		routerMiddleware: [
			{
				path: "/**",
				middleware: originCheckMiddleware,
			},
			...middlewares,
		],
		allowedMediaTypes: ["application/json"],
		async onRequest(req) {
			//handle disabled paths
			const disabledPaths = ctx.options.disabledPaths || [];
			const pathname = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
			const normalizedPath =
				basePath === "/"
					? pathname
					: pathname.startsWith(basePath)
						? pathname.slice(basePath.length).replace(/\/+$/, "") || "/"
						: pathname;
			if (disabledPaths.includes(normalizedPath)) {
				return new Response("Not Found", { status: 404 });
			}
			for (const plugin of ctx.options.plugins || []) {
				if (plugin.onRequest) {
					const response = await plugin.onRequest(req, ctx);
					if (response && "response" in response) {
						return response.response;
					}
					if (response && "request" in response) {
						const rateLimitResponse = await onRequestRateLimit(
							response.request,
							ctx,
						);
						if (rateLimitResponse) {
							return rateLimitResponse;
						}
						return response.request;
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

			const optLogLevel = options.logger?.level;
			const log =
				optLogLevel === "error" ||
				optLogLevel === "warn" ||
				optLogLevel === "debug"
					? logger
					: undefined;
			if (options.logger?.disabled !== true) {
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
						ctx.logger?.error(e.message);
						return;
					}
				}

				if (e instanceof APIError) {
					if (e.status === "INTERNAL_SERVER_ERROR") {
						ctx.logger.error(e.status, e);
					}
					log?.error(e.message);
				} else {
					ctx.logger?.error(
						e && typeof e === "object" && "name" in e ? (e.name as string) : "",
						e,
					);
				}
			}
		},
	});
};

export {
	type AuthEndpoint,
	type AuthMiddleware,
	createAuthEndpoint,
	createAuthMiddleware,
	optionsMiddleware,
} from "@better-auth/core/api";
export { APIError } from "better-call";
export { getIp } from "../utils/get-request-ip";
export * from "./middlewares";
export * from "./routes";
