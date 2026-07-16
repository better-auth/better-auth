import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const ruUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Неверное имя пользователя или пароль",
	EMAIL_NOT_VERIFIED: "Email не подтвержден",
	UNEXPECTED_ERROR: "Непредвиденная ошибка",
	USERNAME_IS_ALREADY_TAKEN:
		"Имя пользователя уже занято. Пожалуйста, попробуйте другое.",
	USERNAME_TOO_SHORT: "Имя пользователя слишком короткое",
	USERNAME_TOO_LONG: "Имя пользователя слишком длинное",
	INVALID_USERNAME: "Недопустимое имя пользователя",
	INVALID_DISPLAY_USERNAME: "Недопустимое отображаемое имя",
	USERNAME_IS_IMMUTABLE: "Имя пользователя не может быть изменено",
};
