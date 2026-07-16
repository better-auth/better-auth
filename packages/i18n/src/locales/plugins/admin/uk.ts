import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const ukAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Не вдалося створити користувача",
	USER_ALREADY_EXISTS: "Користувач вже існує.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Користувач вже існує. Використовуйте іншу електронну пошту.",
	YOU_CANNOT_BAN_YOURSELF: "Ви не можете заблокувати себе",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"У вас немає прав для зміни ролі користувачів",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"У вас немає прав для створення користувачів",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"У вас нет прав для перегляду списку користувачів",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"У вас немає прав для перегляду сесій користувачів",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"У вас немає прав для блокування користувачів",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"У вас немає прав для імітації користувачів",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"У вас немає прав для відкликання сесій користувачів",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"У вас немає прав для видалення користувачів",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"У вас немає прав для зміни пароля користувачів",
	BANNED_USER: "Вас було заблоковано в цьому додатку",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "У вас немає прав для отримання користувача",
	NO_DATA_TO_UPDATE: "Немає даних для оновлення",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"У вас немає прав для оновлення користувачів",
	YOU_CANNOT_REMOVE_YOURSELF: "Ви не можете видалити себе",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"У вас немає прав для встановлення ролі, якої не існує",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Ви не можете імітувати адміністраторів",
	INVALID_ROLE_TYPE: "Недійсний тип ролі",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"У вас немає прав для зміни електронної пошти користувачів",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Пароль не можна змінити через оновлення користувача. Використовуйте натомість ендпоінт set-user-password",
};
