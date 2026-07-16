import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const ukAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "Електронна пошта була створена в недійсному форматі",
		FAILED_TO_CREATE_USER: "Не вдалося створити користувача",
		COULD_NOT_CREATE_SESSION: "Не вдалося створити сесію",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Анонімні користувачі не можуть увійти анонімно знову",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Не вдалося видалити анонімного користувача",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Не вдалося видалити сесії анонімного користувача",
		USER_IS_NOT_ANONYMOUS: "Користувач не анонімний",
		DELETE_ANONYMOUS_USER_DISABLED: "Видалення анонімних користувачів вимкнено",
	};
