import { getAdapter } from "./db/adapter";
import { createKyselyAdapter } from "./db/kysely";
import { BetterAuthError } from "./error/better-auth-error";
import { BetterAuthOptions } from "./types";
import { getCookies } from "./utils/cookies";
import { createLogger } from "./utils/logger";

export const init = (options: BetterAuthOptions) => {
	const db = createKyselyAdapter(options);
	if (!db) {
		throw new BetterAuthError("Failed to initialize database");
	}
	return {
		options,
		authCookies: getCookies(options),
		logger: createLogger({
			disabled: options.disableLog,
		}),
		db,
		adapter: getAdapter(db, options),
	};
};

export type AuthContext = ReturnType<typeof init>;
