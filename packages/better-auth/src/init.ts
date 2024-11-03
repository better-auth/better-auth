import type { Kysely } from "kysely";
import { getAuthTables } from "./db/get-tables";
import { createKyselyAdapter } from "./adapters/kysely-adapter/dialect";
import { getAdapter } from "./db/utils";
import { hashPassword, verifyPassword } from "./crypto/password";
import { createInternalAdapter } from "./db";
import { env, isProduction } from "./utils/env";
import type {
	Adapter,
	BetterAuthOptions,
	BetterAuthPlugin,
	SecondaryStorage,
} from "./types";
import { defu } from "defu";
import { getBaseURL } from "./utils/url";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./cookies";
import { createLogger, logger } from "./utils/logger";
import { socialProviderList, socialProviders } from "./social-providers";
import type { OAuthProvider } from "./oauth2";
import { generateId } from "./utils";
import { checkPassword } from "./utils/password";

export const init = async (options: BetterAuthOptions) => {
	const adapter = await getAdapter(options);
	const plugins = options.plugins || [];
	const internalPlugins = getInternalPlugins(options);

	const { kysely: db } = await createKyselyAdapter(options);
	const baseURL = getBaseURL(options.baseURL, options.basePath);

	const secret =
		options.secret ||
		env.BETTER_AUTH_SECRET ||
		env.AUTH_SECRET ||
		DEFAULT_SECRET;

	if (secret === DEFAULT_SECRET) {
		if (isProduction) {
			logger.error(
				"You are using the default secret. Please set `BETTER_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.",
			);
		}
	}

	options = {
		...options,
		secret,
		baseURL: baseURL ? new URL(baseURL).origin : "",
		basePath: options.basePath || "/api/auth",
		plugins: plugins.concat(internalPlugins),
		emailAndPassword: {
			...options.emailAndPassword,
			enabled: options.emailAndPassword?.enabled ?? false,
			autoSignIn: options.emailAndPassword?.autoSignIn ?? true,
		},
	};
	const cookies = getCookies(options);

	const tables = getAuthTables(options);
	const providers = Object.keys(options.socialProviders || {})
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
			return socialProviders[key as (typeof socialProviderList)[number]](value);
		})
		.filter((x) => x !== null);

	const ctx: AuthContext = {
		appName: options.appName || "Better Auth",
		socialProviders: providers,
		options,
		tables,
		trustedOrigins: getTrustedOrigins(options),
		baseURL: baseURL || "",
		sessionConfig: {
			updateAge: options.session?.updateAge || 24 * 60 * 60, // 24 hours
			expiresIn: options.session?.expiresIn || 60 * 60 * 24 * 7, // 7 days
		},
		secret,
		rateLimit: {
			...options.rateLimit,
			enabled: options.rateLimit?.enabled ?? isProduction,
			window: options.rateLimit?.window || 10,
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
		uuid: generateId,
		secondaryStorage: options.secondaryStorage,
		password: {
			hash: options.emailAndPassword?.password?.hash || hashPassword,
			verify: options.emailAndPassword?.password?.verify || verifyPassword,
			config: {
				minPasswordLength: options.emailAndPassword?.minPasswordLength || 8,
				maxPasswordLength: options.emailAndPassword?.maxPasswordLength || 128,
			},
			checkPassword,
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
	uuid: (size?: number) => string;
	secondaryStorage: SecondaryStorage | undefined;
	password: {
		hash: (password: string) => Promise<string>;
		verify: (hash: string, password: string) => Promise<boolean>;
		config: {
			minPasswordLength: number;
			maxPasswordLength: number;
		};
		checkPassword: typeof checkPassword;
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
		return [];
	}
	const trustedOrigins = [new URL(baseURL).origin];
	if (options.trustedOrigins) {
		trustedOrigins.push(...options.trustedOrigins);
	}
	const envTrustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
	if (envTrustedOrigins) {
		trustedOrigins.push(...envTrustedOrigins.split(","));
	}
	return trustedOrigins;
}
