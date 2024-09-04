import { createKyselyAdapter } from "./adapters/kysely";
import { getAdapter } from "./adapters/utils";
import { createInternalAdapter } from "./db";
import type { BetterAuthOptions } from "./types";
import { getBaseURL } from "./utils/base-url";
import {
	type BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./utils/cookies";
import { createLogger } from "./utils/logger";

export const init = (options: BetterAuthOptions) => {
	const adapter = getAdapter(options);
	const db = createKyselyAdapter(options);
	const baseURL = getBaseURL(options.baseURL);

	return {
		options: {
			...options,
			baseURL,
		},
		baseURL: baseURL || "",
		session: {
			updateAge: options.session?.updateAge || 24 * 60 * 60, // 24 hours
			expiresIn: options.session?.expiresIn || 60 * 60 * 24 * 7, // 7 days
		},
		secret:
			options.secret ||
			process.env.BETTER_AUTH_SECRET ||
			process.env.AUTH_SECRET ||
			"better-auth-secret-123456789",
		authCookies: getCookies(options),
		logger: createLogger({
			disabled: options.disableLog,
		}),
		db,
		adapter: adapter,
		internalAdapter: createInternalAdapter(adapter, options),
		createAuthCookie: createCookieGetter(options),
	};
};

export type AuthContext = {
	options: BetterAuthOptions;
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
};
