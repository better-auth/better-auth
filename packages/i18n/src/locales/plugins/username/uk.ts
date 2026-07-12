import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const ukUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Неправильне ім'я користувача або пароль",
	EMAIL_NOT_VERIFIED: "Електронна пошта не підтверджена",
	UNEXPECTED_ERROR: "Неочікувана помилка",
	USERNAME_IS_ALREADY_TAKEN:
		"Ім'я користувача вже зайняте. Будь ласка, спробуйте інше.",
	USERNAME_TOO_SHORT: "Ім'я користувача занадто коротке",
	USERNAME_TOO_LONG: "Ім'я користувача занадто довге",
	INVALID_USERNAME: "Неприпустиме ім'я користувача",
	INVALID_DISPLAY_USERNAME: "Неприпустиме ім'я для відображення",
	USERNAME_IS_IMMUTABLE: "Ім'я користувача не може бути змінено",
};
