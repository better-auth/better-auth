import type { Kysely } from "kysely";
import { getAuthTables } from "./db/get-tables";
import { createKyselyAdapter } from "./adapters/kysely-adapter/dialect";
import { getAdapter } from "./db/utils";
import { hashPassword, verifyPassword } from "./crypto/password";
import { createInternalAdapter } from "./db";
import type {
	Adapter,
	BetterAuthOptions,
	BetterAuthPlugin,
	OAuthProvider,
	SecondaryStorage,
} from "./types";
import { defu } from "defu";
import { getBaseURL } from "./utils/base-url";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./cookies";
import { createLogger, logger } from "./utils/logger";
import { oAuthProviderList, oAuthProviders } from "./social-providers";
import { BetterAuthError } from "./error/better-auth-error";

export const init = async (options: BetterAuthOptions) => {
	const adapter = await getAdapter(options);
	const plugins = options.plugins || [];
	const internalPlugins = getInternalPlugins(options);

	const { kysely: db } = await createKyselyAdapter(options);
	const baseURL = getBaseURL(options.baseURL, options.basePath);

	if (!baseURL) {
		throw new BetterAuthError(
			"Base URL can not be empty. Please add `BETTER_AUTH_URL` in your environment variables or pass it your auth config.",
		);
	}

	const secret =
		options.secret ||
		process.env.BETTER_AUTH_SECRET ||
		process.env.AUTH_SECRET ||
		DEFAULT_SECRET;

	if (secret === DEFAULT_SECRET) {
		if (process.env.NODE_ENV === "production") {
			throw new BetterAuthError(
				"You are using the default secret. Please set `BETTER_AUTH_SECRET` or `AUTH_SECRET` in your environment variables or pass `secret` in your auth config.",
			);
		}
	}

	options = {
		...options,
		secret,
		baseURL: baseURL ? new URL(baseURL).origin : "",
		basePath: options.basePath || "/api/auth",
		plugins: plugins.concat(internalPlugins),
	};
	const cookies = getCookies(options);

	const tables = getAuthTables(options);
	const socialProviders = Object.keys(options.socialProviders || {})
		.map((key) => {
			const value = options.socialProviders?.[key as "github"]!;
			if (value.enabled === false) {
				return null;
			}
			if (!value.clientId || !value.clientSecret) {
				logger.warn(
					`Social provider ${key} is missing clientId or clientSecret`,
				);
			}
			return oAuthProviders[key as (typeof oAuthProviderList)[number]](value);
		})
		.filter((x) => x !== null);

	const ctx: AuthContext = {
		appName: options.appName || "Better Auth",
		socialProviders,
		options,
		tables,
		trustedOrigins: getTrustedOrigins(options),
		baseURL: baseURL,
		sessionConfig: {
			updateAge: options.session?.updateAge || 24 * 60 * 60, // 24 hours
			expiresIn: options.session?.expiresIn || 60 * 60 * 24 * 7, // 7 days
		},
		secret,
		rateLimit: {
			...options.rateLimit,
			enabled:
				options.rateLimit?.enabled ?? process.env.NODE_ENV !== "development",
			window: options.rateLimit?.window || 60,
			max: options.rateLimit?.max || 100,
			storage:
				options.rateLimit?.storage || options.secondaryStorage
					? ("secondary-storage" as const)
					: ("memory" as const),
		},
		authCookies: cookies,
		logger: createLogger({
			disabled: options.logger?.disabled || false,
		}),
		db,
		secondaryStorage: options.secondaryStorage,
		password: {
			hash: options.emailAndPassword?.password?.hash || hashPassword,
			verify: options.emailAndPassword?.password?.verify || verifyPassword,
			config: {
				minPasswordLength: options.emailAndPassword?.minPasswordLength || 8,
				maxPasswordLength: options.emailAndPassword?.maxPasswordLength || 128,
			},
		},
		adapter: adapter,
		internalAdapter: createInternalAdapter(adapter, {
			options,
			hooks: options.databaseHooks ? [options.databaseHooks] : [],
		}),
		createAuthCookie: createCookieGetter(options),
	};
	let { context } = runPluginInit(ctx);
	return context;
};

export type AuthContext = {
	options: BetterAuthOptions;
	appName: string;
	baseURL: string;
	trustedOrigins: string[];
	socialProviders: OAuthProvider[];
	authCookies: BetterAuthCookies;
	logger: ReturnType<typeof createLogger>;
	db: Kysely<any> | null;
	rateLimit: {
		enabled: boolean;
		window: number;
		max: number;
		storage: "memory" | "database" | "secondary-storage";
	} & BetterAuthOptions["rateLimit"];
	adapter: Adapter;
	internalAdapter: ReturnType<typeof createInternalAdapter>;
	createAuthCookie: ReturnType<typeof createCookieGetter>;
	secret: string;
	sessionConfig: {
		updateAge: number;
		expiresIn: number;
	};
	secondaryStorage: SecondaryStorage | undefined;
	password: {
		hash: (password: string) => Promise<string>;
		verify: (hash: string, password: string) => Promise<boolean>;
		config: {
			minPasswordLength: number;
			maxPasswordLength: number;
		};
	};
	tables: ReturnType<typeof getAuthTables>;
};

function runPluginInit(ctx: AuthContext) {
	let options = ctx.options;
	const plugins = options.plugins || [];
	let context: AuthContext = ctx;
	const dbHooks: BetterAuthOptions["databaseHooks"][] = [];
	for (const plugin of plugins) {
		if (plugin.init) {
			const result = plugin.init(ctx);
			if (typeof result === "object") {
				if (result.options) {
					if (result.options.databaseHooks) {
						dbHooks.push(result.options.databaseHooks);
					}
					options = defu(options, result.options);
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
	context.internalAdapter = createInternalAdapter(ctx.adapter, {
		options,
		hooks: dbHooks.filter((u) => u !== undefined),
	});
	context.options = options;
	return { context };
}

function getInternalPlugins(options: BetterAuthOptions) {
	const plugins: BetterAuthPlugin[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {
		//TODO: add internal plugin
	}
	return plugins;
}

function getTrustedOrigins(options: BetterAuthOptions) {
	const baseURL = getBaseURL(options.baseURL, options.basePath);
	if (!baseURL) {
		throw new BetterAuthError(
			"Base URL can not be empty. Please add `BETTER_AUTH_URL` in your environment variables or pass it in your auth config.",
		);
	}
	const trustedOrigins = [new URL(baseURL).origin];
	if (options.trustedOrigins) {
		trustedOrigins.push(...options.trustedOrigins);
	}
	const envTrustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
	if (envTrustedOrigins) {
		trustedOrigins.push(...envTrustedOrigins.split(","));
	}
	return trustedOrigins;
}
