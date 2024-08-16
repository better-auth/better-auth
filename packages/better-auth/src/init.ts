import { BetterAuthOptions } from "./types";
import { getCookies } from "./utils/cookies";
import { createLogger } from "./utils/logger";

export const init = (options: BetterAuthOptions) => {
	return {
		options,
		authCookies: getCookies(options),
		logger: createLogger({
			disabled: options.disableLog,
		}),
	};
};

export type AuthContext = ReturnType<typeof init>;
