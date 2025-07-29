export interface TelegramProfile {
	id: number;
	first_name?: string;
	last_name?: string;
	username?: string;
	photo_url?: string;
	// TODO does is_bot, language etc also exist here?
}
