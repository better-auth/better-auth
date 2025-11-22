// https://core.telegram.org/widgets/login#receiving-authorization-data

export interface TelegramProfile {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
}

export type TelegramPayloadData = {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	auth_date: number;
	hash: string;
};

export type TelegramPayload = false | TelegramPayloadData;
