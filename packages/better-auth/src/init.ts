import type { Kysely } from "kysely";
import { getAuthTables } from "./adapters/get-tables";
import { createKyselyAdapter } from "./adapters/kysely";
import { getAdapter } from "./adapters/utils";
import { hashPassword, verifyPassword } from "./crypto/password";
import { createInternalAdapter } from "./db";
import type { BetterAuthOptions, OAuthProvider } from "./types";
import { getBaseURL } from "./utils/base-url";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./utils/cookies";
import { createLogger } from "./utils/logger";
import { oAuthProviderList, oAuthProviders } from "./social-providers";
import { BetterAuthError } from "./error/better-auth-error";

export const init = (options: BetterAuthOptions) => {
	const adapter = getAdapter(options);
	const db = createKyselyAdapter(options);
	if (!db) {
		throw new BetterAuthError("No database adapter found");
	}
	const baseURL = getBaseURL(options.baseURL, options.basePath);

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
				throw new BetterAuthError(
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
		},
		tables,
		baseURL: baseURL || "",
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
			disabled: options.disableLog,
		}),
		db,
		password: {
			hash: options.emailAndPassword?.password?.hash || hashPassword,
			verify: options.emailAndPassword?.password?.verify || verifyPassword,
		},
		adapter: adapter,
		internalAdapter: createInternalAdapter(adapter, db, options),
		createAuthCookie: createCookieGetter(options),
	};
};

export type AuthContext = {
	options: BetterAuthOptions;
	appName: string;
	baseURL: string;
	socialProviders: OAuthProvider[];
	authCookies: BetterAuthCookies;
	logger: ReturnType<typeof createLogger>;
	db: Kysely<any>;
	rateLimit: {
		enabled: boolean;
		window: number;
		max: number;
		storage: "memory" | "database";
	} & BetterAuthOptions["rateLimit"];
	adapter: ReturnType<typeof getAdapter>;
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
	};
	tables: ReturnType<typeof getAuthTables>;
};
