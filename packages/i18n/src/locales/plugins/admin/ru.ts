import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const ruAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Не удалось создать пользователя",
	USER_ALREADY_EXISTS: "Пользователь уже существует.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Пользователь уже существует. Используйте другой email.",
	YOU_CANNOT_BAN_YOURSELF: "Вы не можете заблокировать себя",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"У вас нет прав для изменения роли пользователей",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"У вас нет прав для создания пользователей",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"У вас нет прав для просмотра списка пользователей",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"У вас нет прав для просмотра списка сессий пользователей",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"У вас нет прав для блокировки пользователей",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"У вас нет прав для имитации пользователей",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"У вас нет прав для отзыва сессий пользователей",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"У вас нет прав для удаления пользователей",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"У вас нет прав для изменения пароля пользователей",
	BANNED_USER: "Вы были заблокированы в этом приложении",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "У вас нет прав для получения пользователя",
	NO_DATA_TO_UPDATE: "Нет данных для обновления",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"У вас нет прав для обновления данных пользователей",
	YOU_CANNOT_REMOVE_YOURSELF: "Вы не можете удалить себя",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"У вас нет прав для установки несуществующей роли",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Вы не можете имитировать администраторов",
	INVALID_ROLE_TYPE: "Недопустимый тип роли",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"У вас нет прав для изменения email пользователей",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Пароль нельзя обновить через обновление пользователя. Используйте для этого эндпоинт set-user-password",
};
