import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const svAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "E-postadressen skapades inte i ett giltigt format",
		FAILED_TO_CREATE_USER: "Det gick inte att skapa användare",
		COULD_NOT_CREATE_SESSION: "Det gick inte att skapa session",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonyma användare kan inte logga in anonymt igen",
		FAILED_TO_DELETE_ANONYMOUS_USER:
			"Det gick inte att ta bort anonym användare",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Det gick inte att ta bort sessioner för anonym användare",
		USER_IS_NOT_ANONYMOUS: "Användaren är inte anonym",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Borttagning av anonyma användare är inaktiverad",
	};
