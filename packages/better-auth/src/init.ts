import { defu } from "defu";
import { hashPassword, verifyPassword } from "./crypto/password";
import { createInternalAdapter, getMigrations } from "./db";
import { getAuthTables } from "./db/get-tables";
import { getAdapter } from "./db/utils";
import type {
	Adapter,
	BetterAuthOptions,
	BetterAuthPlugin,
	Models,
	SecondaryStorage,
	Session,
	User,
} from "./types";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./cookies";
import { createLogger } from "./utils/logger";
import { socialProviderList, socialProviders } from "./social-providers";
import type { OAuthProvider } from "./oauth2";
import { generateId } from "./utils";
import { env, isProduction } from "./utils/env";
import { checkPassword } from "./utils/password";
import { getBaseURL } from "./utils/url";
import type { LiteralUnion } from "./types/helper";
import { BetterAuthError } from "./error";

export const init = async (options: BetterAuthOptions) => {
	const adapter = await getAdapter(options);
	const plugins = options.plugins || [];
	const internalPlugins = getInternalPlugins(options);
	const logger = createLogger(options.logger);

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
	};
	const cookies = getCookies(options);
	const tables = getAuthTables(options);
	const providers = Object.keys(options.socialProviders || {})
		.map((key) => {
			const value = options.socialProviders?.[key as "github"]!;
			if (!value || value.enabled === false) {
				return null;
			}
			if (!value.clientId) {
				logger.warn(
					`Social provider ${key} is missing clientId or clientSecret`,
				);
			}
			const provider = socialProviders[
				key as (typeof socialProviderList)[number]
			](
				value as any, // TODO: fix this
			);
			(provider as OAuthProvider).disableImplicitSignUp =
				value.disableImplicitSignUp;
			return provider;
		})
		.filter((x) => x !== null);

	const generateIdFunc: AuthContext["generateId"] = ({ model, size }) => {
		if (typeof options.advanced?.generateId === "function") {
			return options.advanced.generateId({ model, size });
		}
		if (typeof options?.advanced?.database?.generateId === "function") {
			return options.advanced.database.generateId({ model, size });
		}
		return generateId(size);
	};

	const ctx: AuthContext = {
		appName: options.appName || "Better Auth",
		socialProviders: providers,
		options,
		tables,
		trustedOrigins: getTrustedOrigins(options),
		baseURL: baseURL || "",
		sessionConfig: {
			updateAge:
				options.session?.updateAge !== undefined
					? options.session.updateAge
					: 24 * 60 * 60, // 24 hours
			expiresIn: options.session?.expiresIn || 60 * 60 * 24 * 7, // 7 days
			freshAge:
				options.session?.freshAge === undefined
					? 60 * 60 * 24 // 24 hours
					: options.session.freshAge,
		},
		secret,
		rateLimit: {
			...options.rateLimit,
			enabled: options.rateLimit?.enabled ?? isProduction,
			window: options.rateLimit?.window || 10,
			max: options.rateLimit?.max || 100,
			storage:
				options.rateLimit?.storage ||
				(options.secondaryStorage ? "secondary-storage" : "memory"),
		},
		authCookies: cookies,
		logger: logger,
		generateId: generateIdFunc,
		session: null,
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
		setNewSession(session) {
			this.newSession = session;
		},
		newSession: null,
		adapter: adapter,
		internalAdapter: createInternalAdapter(adapter, {
			options,
			hooks: options.databaseHooks ? [options.databaseHooks] : [],
			generateId: generateIdFunc,
		}),
		createAuthCookie: createCookieGetter(options),
		async runMigrations() {
			//only run migrations if database is provided and it's not an adapter
			if (!options.database || "updateMany" in options.database) {
				throw new BetterAuthError(
					"Database is not provided or it's an adapter. Migrations are only supported with a database instance.",
				);
			}
			const { runMigrations } = await getMigrations(options);
			await runMigrations();
		},
	};
	let { context } = runPluginInit(ctx);
	return context;
};

export type AuthContext = {
	options: BetterAuthOptions;
	appName: string;
	baseURL: string;
	trustedOrigins: string[];
	/**
	 * New session that will be set after the request
	 * meaning: there is a `set-cookie` header that will set
	 * the session cookie. This is the fetched session. And it's set
	 * by `setNewSession` method.
	 */
	newSession: {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	} | null;
	session: {
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	} | null;
	setNewSession: (
		session: {
			session: Session & Record<string, any>;
			user: User & Record<string, any>;
		} | null,
	) => void;
	socialProviders: OAuthProvider[];
	authCookies: BetterAuthCookies;
	logger: ReturnType<typeof createLogger>;
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
		freshAge: number;
	};
	generateId: (options: {
		model: LiteralUnion<Models, string>;
		size?: number;
	}) => string;
	secondaryStorage: SecondaryStorage | undefined;
	password: {
		hash: (password: string) => Promise<string>;
		verify: (data: { password: string; hash: string }) => Promise<boolean>;
		config: {
			minPasswordLength: number;
			maxPasswordLength: number;
		};
		checkPassword: typeof checkPassword;
	};
	tables: ReturnType<typeof getAuthTables>;
	runMigrations: () => Promise<void>;
};

function runPluginInit(ctx: AuthContext) {
	let options = ctx.options;
	const plugins = options.plugins || [];
	let context: AuthContext = ctx;
	const dbHooks: BetterAuthOptions["databaseHooks"][] = [];
	for (const plugin of plugins) {
		if (plugin.init) {
			const result = plugin.init(context);
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
	context.internalAdapter = createInternalAdapter(ctx.adapter, {
		options,
		hooks: dbHooks.filter((u) => u !== undefined),
		generateId: ctx.generateId,
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
	if (options.trustedOrigins && Array.isArray(options.trustedOrigins)) {
		trustedOrigins.push(...options.trustedOrigins);
	}
	const envTrustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
	if (envTrustedOrigins) {
		trustedOrigins.push(...envTrustedOrigins.split(","));
	}
	if (trustedOrigins.filter((x) => !x).length) {
		throw new BetterAuthError(
			"A provided trusted origin is invalid, make sure your trusted origins list is properly defined.",
		);
	}
	return trustedOrigins;
}
