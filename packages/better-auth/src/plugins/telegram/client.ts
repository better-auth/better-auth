import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { telegram } from ".";
import { TELEGRAM_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const telegramClient = () => {
	return {
		id: "telegram",
		$InferServerPlugin: {} as ReturnType<typeof telegram>,
		$ERROR_CODES: TELEGRAM_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
