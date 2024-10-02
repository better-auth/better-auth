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
} from "./types";

import { defu } from "defu";
import { getBaseURL } from "./utils/base-url";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./utils/cookies";
import { createLogger, logger } from "./utils/logger";
import { oAuthProviderList, oAuthProviders } from "./social-providers";
import { crossSubdomainCookies } from "./internal-plugins";

export const init = async (opts: BetterAuthOptions) => {
	/**
	 * Run plugins init to get the actual options
	 */
	const { options, context } = runPluginInit(opts);
	const plugins = options.plugins || [];
	const internalPlugins = getInternalPlugins(options);
	const adapter = await getAdapter(options);
	const { kysely: db } = await createKyselyAdapter(options);
	const baseURL = getBaseURL(options.baseURL, options.basePath) || "";

	const secret =
		options.secret ||
		process.env.BETTER_AUTH_SECRET ||
		process.env.AUTH_SECRET ||
		DEFAULT_SECRET;

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

	return {
		appName: options.appName || "Better Auth",
		socialProviders,
		options: {
			...options,
			baseURL: baseURL ? new URL(baseURL).origin : "",
			basePath: options.basePath || "/api/auth",
			plugins: plugins.concat(internalPlugins),
		},
		tables,
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
			storage: options.rateLimit?.storage || "memory",
		},
		authCookies: cookies,
		logger: createLogger({
			disabled: options.logger?.disabled || false,
		}),
		db,
		password: {
			hash: options.emailAndPassword?.password?.hash || hashPassword,
			verify: options.emailAndPassword?.password?.verify || verifyPassword,
			config: {
				minPasswordLength: options.emailAndPassword?.minPasswordLength || 8,
				maxPasswordLength: options.emailAndPassword?.maxPasswordLength || 128,
			},
		},
		adapter: adapter,
		internalAdapter: createInternalAdapter(adapter, options),
		createAuthCookie: createCookieGetter(options),
		...context,
	};
};

export type AuthContext = {
	options: BetterAuthOptions;
	appName: string;
	baseURL: string;
	socialProviders: OAuthProvider[];
	authCookies: BetterAuthCookies;
	logger: ReturnType<typeof createLogger>;
	db: Kysely<any> | null;
	rateLimit: {
		enabled: boolean;
		window: number;
		max: number;
		storage: "memory" | "database";
	} & BetterAuthOptions["rateLimit"];
	adapter: Adapter;
	internalAdapter: ReturnType<typeof createInternalAdapter>;
	createAuthCookie: ReturnType<typeof createCookieGetter>;
	secret: string;
	sessionConfig: {
		updateAge: number;
		expiresIn: number;
	};
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

function runPluginInit(options: BetterAuthOptions) {
	const plugins = options.plugins || [];
	let context: Partial<AuthContext> = {};
	for (const plugin of plugins) {
		if (plugin.init) {
			const result = plugin.init(options);
			if (typeof result === "object") {
				if (result.options) {
					options = defu(options, result.options);
				}
				if (result.context) {
					context = defu(context, result.context);
				}
			}
		}
	}
	return {
		options,
		context,
	};
}

function getInternalPlugins(options: BetterAuthOptions) {
	const plugins: BetterAuthPlugin[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {
		plugins.push(
			crossSubdomainCookies({
				eligibleCookies: options.advanced.crossSubDomainCookies.eligibleCookies,
			}),
		);
	}
	return plugins;
}
