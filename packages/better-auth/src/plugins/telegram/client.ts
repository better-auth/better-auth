import type { BetterAuthClientPlugin } from "../../client/types";
import type { telegram } from ".";

type TelegramPlugin = typeof telegram;

export const telegramClient = () => {
	return {
		id: "telegram",
		$InferServerPlugin: {} as ReturnType<TelegramPlugin>,
	} satisfies BetterAuthClientPlugin;
};
