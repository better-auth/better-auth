import { defu } from "defu";
import { hashPassword, verifyPassword } from "./crypto/password";
import {
	type BetterAuthDbSchema,
	createInternalAdapter,
	type InternalAdapter,
	getAuthTables,
	getMigrations,
	schema,
} from "./db";
import type { Entries } from "type-fest";
import { getAdapter } from "./db/utils";
import type {
	Adapter,
	AuthPluginSchema,
	BetterAuthOptions,
	BetterAuthPlugin,
	Models,
	SecondaryStorage,
} from "./types";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./cookies";
import { createLogger } from "./utils/logger";
import { type SocialProviders, socialProviders } from "./social-providers";
import type { OAuthProvider } from "./oauth2";
import { generateId } from "./utils";
import { env, isProduction } from "./utils/env";
import { checkPassword } from "./utils/password";
import { getBaseURL } from "./utils/url";
import type { LiteralUnion, MergeSchema, SchemaTypes } from "./types/helper";
import { BetterAuthError } from "./error";
import { createTelemetry } from "./telemetry";
import type { TelemetryEvent } from "./telemetry/types";
import { getKyselyDatabaseType } from "./adapters/kysely-adapter";
import { checkEndpointConflicts } from "./api";
import { isPromise } from "./utils/is-promise";

export const init = async <S extends typeof schema = typeof schema>(options: BetterAuthOptions<S>) => {
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

	checkEndpointConflicts(options, logger);
	const cookies = getCookies(options);
	const tables = getAuthTables(options);
	const providers: OAuthProvider[] = (
		Object.entries(
			options.socialProviders || {},
		) as unknown as Entries<SocialProviders>
	)
		.map(([key, config]) => {
			if (config == null) {
				return null;
			}
			if (config.enabled === false) {
				return null;
			}
			if (!config.clientId) {
				logger.warn(
					`Social provider ${key} is missing clientId or clientSecret`,
				);
			}
			const provider = socialProviders[key](config as never);
			(provider as OAuthProvider).disableImplicitSignUp =
				config.disableImplicitSignUp;
			return provider;
		})
		.filter((x) => x !== null);

	const generateIdFunc: AuthContext<S>["generateId"] = ({ model, size }) => {
		if (typeof options.advanced?.generateId === "function") {
			return options.advanced.generateId({ model, size });
		}
		if (typeof options?.advanced?.database?.generateId === "function") {
			return options.advanced.database.generateId({ model, size });
		}
		return generateId(size);
	};

	const { publish } = await createTelemetry(options, {
		adapter: adapter.id,
		database:
			typeof options.database === "function"
				? "adapter"
				: getKyselyDatabaseType(options.database) || "unknown",
	});

	let ctx: AuthContext<S> = {
		appName: options.appName || "Better Auth",
		socialProviders: providers,
		options,
		tables: tables as BetterAuthDbSchema<typeof schema>,
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
		logger,
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
		internalAdapter: createInternalAdapter(adapter as Adapter<typeof schema>, {
			options: options as any as BetterAuthOptions<typeof schema>,
			logger,
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
		publishTelemetry: publish,
	};
	const initOrPromise = runPluginInit(ctx);
	let context: AuthContext<S>;
	if (isPromise(initOrPromise)) {
		({ context } = await initOrPromise);
	} else {
		({ context } = initOrPromise);
	}
	return context;
};

export type AuthContext<T extends AuthPluginSchema, S extends MergeSchema<typeof schema, T> = MergeSchema<typeof schema, T>> = {
	options: BetterAuthOptions<T, S>;
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
		session: SchemaTypes<S["session"]> & Record<string, any>;
		user: SchemaTypes<S["user"]> & Record<string, any>;
	} | null;
	session: {
		session: SchemaTypes<S["session"]> & Record<string, any>;
		user: SchemaTypes<S["user"]> & Record<string, any>;
	} | null;
	setNewSession: (
		session: {
			session: SchemaTypes<S["session"]> & Record<string, any>;
			user: SchemaTypes<S["user"]> & Record<string, any>;
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
	} & BetterAuthOptions<S>["rateLimit"];
	adapter: Adapter<S>;
	internalAdapter: InternalAdapter<S>;
	createAuthCookie: ReturnType<typeof createCookieGetter<S>>;
	secret: string;
	sessionConfig: {
		updateAge: number;
		expiresIn: number;
		freshAge: number;
	};
	generateId: (options: {
		model: LiteralUnion<Models, string>;
		size?: number;
	}) => string | false;
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
	tables: BetterAuthDbSchema;
	runMigrations: () => Promise<void>;
	publishTelemetry: (event: TelemetryEvent) => Promise<void>;
};

async function runPluginInit<S extends AuthPluginSchema>(ctx: AuthContext<S>) {
	let options = ctx.options;
	const plugins = options.plugins || [];
	let context = ctx;
	const dbHooks: BetterAuthOptions<S>["databaseHooks"][] = [];
	for (const plugin of plugins) {
		if (plugin.init) {
			let initPromise = plugin.init(context);
			let result: ReturnType<Required<BetterAuthPlugin<S>>["init"]>;
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
						...(result.context as Partial<AuthContext<S>>),
					};
				}
			}
		}
	}
	// Add the global database hooks last
	dbHooks.push(options.databaseHooks);
	context.internalAdapter = createInternalAdapter(ctx.adapter as Adapter<typeof schema>, {
		options: options as any as BetterAuthOptions<typeof schema>,
		logger: ctx.logger,
		// @ts-expect-error - databaseHooks is correctly typed
		hooks: dbHooks.filter((u) => u !== undefined),
		generateId: ctx.generateId,
	});
	context.options = options;
	return { context };
}

function getInternalPlugins<S extends AuthPluginSchema>(options: BetterAuthOptions<S>) {
	const plugins: BetterAuthPlugin<S>[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled) {
		//TODO: add internal plugin
	}
	return plugins;
}

function getTrustedOrigins<S extends AuthPluginSchema>(options: BetterAuthOptions<S>) {
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
