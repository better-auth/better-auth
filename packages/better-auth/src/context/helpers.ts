import type {
	AuthContext,
	AwaitableFunction,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { env } from "@better-auth/core/env";
import { defu } from "defu";
import { createInternalAdapter } from "../db";
import { isPromise } from "../utils/is-promise";
import { getBaseURL } from "../utils/url";

export async function runPluginInit(context: AuthContext) {
	let options = context.options;
	const plugins = options.plugins || [];
	const dbHooks: BetterAuthOptions["databaseHooks"][] = [];
	for (const plugin of plugins) {
		if (plugin.init) {
			const initPromise = plugin.init(context);
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
					// Use Object.assign to keep the reference to the original context
					Object.assign(context, result.context);
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
}

export function getInternalPlugins(options: BetterAuthOptions) {
	const plugins: BetterAuthPlugin[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {
		// TODO: add internal plugin
	}

	// Infrastructure plugin logic
	const infraConfig = options.infrastructure;
	const apiKey = infraConfig?.apiKey || env.BETTER_AUTH_API_KEY;
	const projectId = infraConfig?.projectId || env.BETTER_AUTH_PROJECT_ID;

	// Determine if infrastructure should be enabled
	// enabled: true -> always enable
	// enabled: false -> never enable
	// enabled: undefined -> auto-enable if API key is available
	const shouldEnable =
		infraConfig?.enabled === true ||
		(infraConfig?.enabled !== false && !!apiKey);

	if (shouldEnable) {
		// Validate that apiKey is available
		if (!apiKey) {
			throw new Error(
				"Better Auth Infrastructure is enabled but no API key was provided. " +
					"Please set BETTER_AUTH_API_KEY environment variable or provide apiKey in infrastructure config.",
			);
		}

		const hasInfraPlugin = options.plugins?.some(
			(p) => p.id === "infra" || p.id === "dash",
		);
		if (!hasInfraPlugin) {
			// Lazy load the infra plugin to avoid circular dependencies
			try {
				// Import the infra plugin synchronously
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const { infra } = require("../plugins/infra");
				plugins.push(
					infra({
						apiKey,
						projectId,
						apiUrl: infraConfig?.apiUrl,
						kvUrl: infraConfig?.kvUrl,
					}),
				);
			} catch (error) {
				throw new Error(
					`Failed to load Better Auth Infrastructure plugin: ${error}`,
				);
			}
		}
	}

	return plugins;
}

export async function getTrustedOrigins(
	options: BetterAuthOptions,
	request?: Request,
): Promise<string[]> {
	const baseURL = getBaseURL(options.baseURL, options.basePath, request);
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
export async function getAwaitableValue<T extends Record<string, any>>(
	arr: AwaitableFunction<T>[] | undefined,
	item: { field?: string; value: string },
): Promise<T | undefined> {
	if (!arr) return undefined;
	for (const val of arr) {
		const value = typeof val === "function" ? await val() : val;
		if (value[item.field ?? "id"] === item.value) {
			return value;
		}
	}
	return undefined;
}
