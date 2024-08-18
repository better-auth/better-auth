import { getAdapter } from "./adapters/utils";
import { createInternalAdapter } from "./db";
import { BetterAuthOptions } from "./types";
import { getCookies } from "./utils/cookies";
import { createLogger } from "./utils/logger";

export const init = (options: BetterAuthOptions) => {
	const adapter = getAdapter(options)
	return {
		options,
		authCookies: getCookies(options),
		logger: createLogger({
			disabled: options.disableLog,
		}),
		adapter: adapter,
		internalAdapter: createInternalAdapter(adapter, options)
	};
};

export type AuthContext = ReturnType<typeof init>;
