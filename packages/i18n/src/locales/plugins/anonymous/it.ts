import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const itAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "L'e-mail non è stata generata in un formato valido",
		FAILED_TO_CREATE_USER: "Impossibile creare l'utente",
		COULD_NOT_CREATE_SESSION: "Impossibile creare la sessione",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Gli utenti anonimi non possono accedere nuovamente in modo anonimo",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Impossibile eliminare l'utente anonimo",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Impossibile eliminare le sessioni dell'utente anonimo",
		USER_IS_NOT_ANONYMOUS: "L'utente non è anonimo",
		DELETE_ANONYMOUS_USER_DISABLED:
			"L'eliminazione degli utenti anonimi è disabilitata",
	};
