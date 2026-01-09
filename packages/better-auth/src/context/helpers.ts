import type {
	AuthContext,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { defu } from "defu";
import { createInternalAdapter } from "../db/internal-adapter";
import { isPromise } from "../utils/is-promise";
import { getBaseURL } from "../utils/url";

export async function runPluginInit(ctx: AuthContext) {
	let options = ctx.options;
	const plugins = options.plugins || [];
	let context: AuthContext = ctx;
	const dbHooks: BetterAuthOptions["databaseHooks"][] = [];
	for (const plugin of plugins) {
		if (plugin.init) {
			let initPromise = plugin.init(context);
			let result: ReturnType<Required<BetterAuthPlugin>["init"]>;
			if (isPromise(initPromise)) {
				result = await initPromise;
			} else {
				result = initPromise;
			}
			if (typeof result === "object") {
				if (result.options) {
					const { databaseHooks, ...restOpts } = result.options;
					if (databaseHooks) {
						dbHooks.push(databaseHooks);
					}
					options = defu(options, restOpts);
				}
				if (result.context) {
					context = {
						...context,
						...(result.context as Partial<AuthContext>),
					};
				}
			}
		}
	}
	// Add the global database hooks last
	dbHooks.push(options.databaseHooks);
	context.internalAdapter = createInternalAdapter(context.adapter, {
		options,
		logger: context.logger,
		hooks: dbHooks.filter((u) => u !== undefined),
		generateId: context.generateId,
	});
	context.options = options;
	return { context };
}

export function getInternalPlugins(options: BetterAuthOptions) {
	const plugins: BetterAuthPlugin[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {
		// TODO: add internal plugin
	}
	return plugins;
}

export async function getTrustedOrigins(
	options: BetterAuthOptions,
	request?: Request,
): Promise<string[]> {
	const baseURL = getBaseURL(options.baseURL, options.basePath);
	const trustedOrigins: (string | undefined | null)[] = baseURL
		? [new URL(baseURL).origin]
		: [];
	if (options.trustedOrigins) {
		if (Array.isArray(options.trustedOrigins)) {
			trustedOrigins.push(...options.trustedOrigins);
		}
		if (typeof options.trustedOrigins === "function") {
			const validOrigins = await options.trustedOrigins(request);
			trustedOrigins.push(...validOrigins);
		}
	}
	const envTrustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
	if (envTrustedOrigins) {
		trustedOrigins.push(...envTrustedOrigins.split(","));
	}
	return trustedOrigins.filter((v): v is string => Boolean(v));
}
