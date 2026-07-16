import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const plAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT:
			"E-mail nie został wygenerowany w prawidłowym formacie",
		FAILED_TO_CREATE_USER: "Nie udało się utworzyć użytkownika",
		COULD_NOT_CREATE_SESSION: "Nie udało się utworzyć sesji",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Użytkownicy anonimowi nie mogą ponownie zalogować się anonimowo",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Nie udało się usunąć anonimowego użytkownika",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Nie udało się usunąć sesji anonimowego użytkownika",
		USER_IS_NOT_ANONYMOUS: "Użytkownik nie jest anonimowy",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Usuwanie anonimowych użytkowników jest wyłączone",
	};
