import { createKyselyAdapter } from "./adapters/kysely";
import { getAdapter } from "./adapters/utils";
import { hashPassword, verifyPassword } from "./crypto/password";
import { createInternalAdapter } from "./db";
import type { BetterAuthOptions } from "./types";
import { getBaseURL } from "./utils/base-url";
import { DEFAULT_SECRET } from "./utils/constants";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./utils/cookies";
import { createLogger } from "./utils/logger";

export const init = (options: BetterAuthOptions) => {
	const adapter = getAdapter(options);
	const db = createKyselyAdapter(options);
	const baseURL = getBaseURL(options.baseURL, options.basePath);

	const secret =
		options.secret ||
		process.env.BETTER_AUTH_SECRET ||
		process.env.AUTH_SECRET ||
		DEFAULT_SECRET;

	const cookies = getCookies(options);

	return {
		appName: options.appName || "Better Auth",
		options: {
			...options,
			baseURL: baseURL ? new URL(baseURL).origin : "",
			basePath: options.basePath || "/api/auth",
		},
		baseURL: baseURL || "",
		session: {
			updateAge: options.session?.updateAge || 24 * 60 * 60, // 24 hours
			expiresIn: options.session?.expiresIn || 60 * 60 * 24 * 7, // 7 days
		},
		secret,
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
		internalAdapter: createInternalAdapter(adapter, options),
		createAuthCookie: createCookieGetter(options),
	};
};

export type AuthContext = {
	options: BetterAuthOptions;
	appName: string;
	baseURL: string;
	authCookies: BetterAuthCookies;
	logger: ReturnType<typeof createLogger>;
	db: ReturnType<typeof createKyselyAdapter>;
	adapter: ReturnType<typeof getAdapter>;
	internalAdapter: ReturnType<typeof createInternalAdapter>;
	createAuthCookie: ReturnType<typeof createCookieGetter>;
	secret: string;
	session: {
		updateAge: number;
		expiresIn: number;
	};
	password: {
		hash: (password: string) => Promise<string>;
		verify: (hash: string, password: string) => Promise<boolean>;
	};
};
