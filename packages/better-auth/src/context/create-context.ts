import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { createLogger, env, isProduction, isTest } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import {
	type SocialProviders,
	socialProviders,
} from "@better-auth/core/social-providers";
import { createTelemetry } from "@better-auth/telemetry";
import defu from "defu";
import type { Entries } from "type-fest";
import { checkEndpointConflicts } from "../api";
import { createCookieGetter, getCookies } from "../cookies";
import { hashPassword, verifyPassword } from "../crypto/password";
import { getAuthTables } from "../db/get-tables";
import { createInternalAdapter } from "../db/internal-adapter";
import { generateId } from "../utils";
import { DEFAULT_SECRET } from "../utils/constants";
import { isPromise } from "../utils/is-promise";
import { checkPassword } from "../utils/password";
import { getBaseURL } from "../utils/url";
import {
	getInternalPlugins,
	getTrustedOrigins,
	runPluginInit,
} from "./helpers";

export async function createAuthContext(
	adapter: DBAdapter<BetterAuthOptions>,
	options: BetterAuthOptions,
	getDatabaseType: (database: BetterAuthOptions["database"]) => string,
): Promise<AuthContext> {
	//set default options for stateless mode
	if (!options.database) {
		options = defu(options, {
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe" as const,
					refreshCache: true,
				},
			},
			advanced: {
				oauthConfig: {
					storeStateStrategy: "cookie" as const,
				},
			},
		});
	}
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

	const generateIdFunc: AuthContext["generateId"] = ({ model, size }) => {
		if (typeof (options.advanced as any)?.generateId === "function") {
			return (options.advanced as any).generateId({ model, size });
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
				: getDatabaseType(options.database),
	});

	let ctx: AuthContext = {
		appName: options.appName || "Better Auth",
		socialProviders: providers,
		options,
		oauthConfig: {
			storeStateStrategy:
				options.advanced?.oauthConfig?.storeStateStrategy || "database",
			skipStateCookieCheck:
				!!options.advanced?.oauthConfig?.skipStateCookieCheck,
		},
		tables,
		trustedOrigins: getTrustedOrigins(options),
		baseURL: baseURL || "",
		sessionConfig: {
			updateAge:
				options.session?.updateAge !== undefined
					? options.session.updateAge
					: 24 * 60 * 60,
			expiresIn: options.session?.expiresIn || 60 * 60 * 24 * 7,
			freshAge:
				options.session?.freshAge === undefined
					? 60 * 60 * 24
					: options.session.freshAge,
			cookieRefreshCache: (() => {
				const refreshCache = options.session?.cookieCache?.refreshCache;
				const maxAge = options.session?.cookieCache?.maxAge || 60 * 5;

				if (refreshCache === false || refreshCache === undefined) {
					return false;
				}

				if (refreshCache === true) {
					return {
						enabled: true,
						updateAge: Math.floor(maxAge * 0.2),
					};
				}

				return {
					enabled: true,
					updateAge:
						refreshCache.updateAge !== undefined
							? refreshCache.updateAge
							: Math.floor(maxAge * 0.2),
				};
			})(),
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
		internalAdapter: createInternalAdapter(adapter, {
			options,
			logger,
			hooks: options.databaseHooks ? [options.databaseHooks] : [],
			generateId: generateIdFunc,
		}),
		createAuthCookie: createCookieGetter(options),
		async runMigrations() {
			throw new BetterAuthError(
				"runMigrations will be set by the specific init implementation",
			);
		},
		publishTelemetry: publish,
		skipCSRFCheck: !!options.advanced?.disableCSRFCheck,
		skipOriginCheck:
			options.advanced?.disableOriginCheck !== undefined
				? options.advanced.disableOriginCheck
				: isTest()
					? true
					: false,
	};

	const initOrPromise = runPluginInit(ctx);
	let context: AuthContext;
	if (isPromise(initOrPromise)) {
		({ context } = await initOrPromise);
	} else {
		({ context } = initOrPromise);
	}

	return context;
}
