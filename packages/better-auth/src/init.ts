import { createKyselyAdapter } from "./adapters/kysely";
import { getAdapter } from "./adapters/utils";
import { createInternalAdapter } from "./db";
import { BetterAuthOptions } from "./types";
import {
	BetterAuthCookies,
	createCookieGetter,
	getCookies,
} from "./utils/cookies";
import { createLogger } from "./utils/logger";

export const init = (options: BetterAuthOptions) => {
	const adapter = getAdapter(options);
	const db = createKyselyAdapter(options);
	return {
		options,
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
	authCookies: BetterAuthCookies;
	logger: ReturnType<typeof createLogger>;
	db: ReturnType<typeof createKyselyAdapter>;
	adapter: ReturnType<typeof getAdapter>;
	internalAdapter: ReturnType<typeof createInternalAdapter>;
	createAuthCookie: ReturnType<typeof createCookieGetter>;
	secret: string;
};
