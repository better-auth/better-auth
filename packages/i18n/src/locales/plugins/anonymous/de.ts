import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const deAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT:
			"E-Mail wurde nicht in einem gültigen Format generiert",
		FAILED_TO_CREATE_USER: "Benutzer konnte nicht erstellt werden",
		COULD_NOT_CREATE_SESSION: "Sitzung konnte nicht erstellt werden",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonyme Benutzer können sich nicht erneut anonym anmelden",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Anonymer Benutzer konnte nicht gelöscht werden",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Sitzungen des anonymen Benutzers konnten nicht gelöscht werden",
		USER_IS_NOT_ANONYMOUS: "Benutzer ist nicht anonym",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Das Löschen anonymer Benutzer ist deaktiviert",
	};
