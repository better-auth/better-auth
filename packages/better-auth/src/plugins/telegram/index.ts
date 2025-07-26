import type { BetterAuthPlugin } from "..";
import type { TelegramProfile } from "./types";

export type TelegramOptions = {
	botToken: string;
	/**
	 * Custom function to map the user profile to a User object.
	 */
	mapProfileToUser?: (profile: TelegramProfile) =>
		| {
				id?: string;
				name?: string;
				email?: string | null;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }
		| Promise<{
				id?: string;
				name?: string;
				email?: string | null;
				image?: string;
				emailVerified?: boolean;
				[key: string]: any;
		  }>;
};

export const ERROR_CODES = {
	INVALID_DATA_OR_HASH: "Invalid Telegram sign-in data",
	FAILED_TO_CREATE_USER: "Failed to create user",
	FAILED_TO_CREATE_SESSION: "Failed to create session",
};

export const telegram = (options: TelegramOptions) => {
	return {
		id: "telegram",
		endpoints: {},
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
