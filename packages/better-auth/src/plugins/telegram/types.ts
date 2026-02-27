export type TelegramOptions = {
	/**
	 * Bot token created from BotFather
	 */
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

// https://core.telegram.org/widgets/login#receiving-authorization-data
export interface TelegramProfile {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
}

export type TelegramPayloadData = {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	auth_date: number;
	hash: string;
};

export type TelegramPayload = false | TelegramPayloadData;
