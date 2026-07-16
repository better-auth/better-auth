import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const ruAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "Email был создан в неверном формате",
		FAILED_TO_CREATE_USER: "Не удалось создать пользователя",
		COULD_NOT_CREATE_SESSION: "Не удалось создать сессию",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Анонимные пользователи не могут войти анонимно снова",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Не удалось удалить анонимного пользователя",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Не удалось удалить сессии анонимного пользователя",
		USER_IS_NOT_ANONYMOUS: "Пользователь не анонимный",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Удаление анонимных пользователей отключено",
	};
