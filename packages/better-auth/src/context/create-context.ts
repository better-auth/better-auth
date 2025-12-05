import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { getAuthTables } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { createLogger, env, isProduction, isTest } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import type { SocialProviders } from "@better-auth/core/social-providers";
import { socialProviders } from "@better-auth/core/social-providers";
import { createTelemetry } from "@better-auth/telemetry";
import defu from "defu";
import type { Entries } from "type-fest";
import { checkEndpointConflicts } from "../api";
import { matchesOriginPattern } from "../auth/trusted-origins";
import { createCookieGetter, getCookies } from "../cookies";
import { hashPassword, verifyPassword } from "../crypto/password";
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

/**
 * Estimates the entropy of a string in bits.
 * This is a simple approximation that helps detect low-entropy secrets.
 */
function estimateEntropy(str: string): number {
	const unique = new Set(str).size;
	if (unique === 0) return 0;
	return Math.log2(Math.pow(unique, str.length));
}

/**
 * Validates that the secret meets minimum security requirements.
 * Throws BetterAuthError if the secret is invalid.
 * Skips validation for DEFAULT_SECRET in test environments only.
 * Only throws for DEFAULT_SECRET in production environment.
 */
function validateSecret(
	secret: string,
	logger: ReturnType<typeof createLogger>,
): void {
	const isDefaultSecret = secret === DEFAULT_SECRET;

	if (isTest()) {
		return;
	}

	if (isDefaultSecret && isProduction) {
		throw new BetterAuthError(
			"You are using the default secret. Please set `BETTER_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.",
		);
	}

	if (!secret) {
		throw new BetterAuthError(
			"BETTER_AUTH_SECRET is missing. Set it in your environment or pass `secret` to betterAuth({ secret }).",
		);
	}

	if (secret.length < 32) {
		throw new BetterAuthError(
			`Invalid BETTER_AUTH_SECRET: must be at least 32 characters long for adequate security. Generate one with \`npx @better-auth/cli secret\` or \`openssl rand -base64 32\`.`,
		);
	}

	// Optional high-entropy check: warn if entropy appears low
	const entropy = estimateEntropy(secret);
	if (entropy < 120) {
		logger.warn(
			"[better-auth] Warning: your BETTER_AUTH_SECRET appears low-entropy. Use a randomly generated secret for production.",
		);
	}
}

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
			account: {
				storeStateStrategy: "cookie" as const,
				storeAccountCookie: true,
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

	validateSecret(secret, logger);

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
			storeStateStrategy: options.account?.storeStateStrategy || "database",
			skipStateCookieCheck: !!options.account?.skipStateCookieCheck,
		},
		tables,
		trustedOrigins: getTrustedOrigins(options),
		isTrustedOrigin(url: string, settings?: { allowRelativePaths: boolean }) {
			return ctx.trustedOrigins.some((origin) =>
				matchesOriginPattern(url, origin, settings),
			);
		},
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
