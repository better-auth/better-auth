import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const nlAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "E-mail is niet in een geldig formaat gegenereerd",
		FAILED_TO_CREATE_USER: "Mislukt om gebruiker aan te maken",
		COULD_NOT_CREATE_SESSION: "Kon sessie niet maken",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonieme gebruikers kunnen niet opnieuw anoniem inloggen",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Mislukt om anonieme gebruiker te verwijderen",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Mislukt om sessies van anonieme gebruiker te verwijderen",
		USER_IS_NOT_ANONYMOUS: "Gebruiker is niet anoniem",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Verwijderen van anonieme gebruikers is uitgeschakeld",
	};
