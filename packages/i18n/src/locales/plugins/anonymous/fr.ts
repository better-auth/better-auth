import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const frAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "L'e-mail n'a pas été généré dans un format valide",
		FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
		COULD_NOT_CREATE_SESSION: "Impossible de créer la session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Les utilisateurs anonymes ne peuvent pas se reconnecter anonymement",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Échec de la suppression de l'utilisateur anonyme",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Échec de la suppression des sessions de l'utilisateur anonyme",
		USER_IS_NOT_ANONYMOUS: "L'utilisateur n'est pas anonyme",
		DELETE_ANONYMOUS_USER_DISABLED:
			"La suppression des utilisateurs anonymes est désactivée",
	};
