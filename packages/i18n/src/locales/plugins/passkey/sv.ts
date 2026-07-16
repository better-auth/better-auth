import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const svPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Utmaning hittades inte",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Du har inte tillåtelse att registrera denna passnyckel",
	FAILED_TO_VERIFY_REGISTRATION: "Misslyckades med att verifiera registrering",
	PASSKEY_NOT_FOUND: "Passnyckel hittades inte",
	AUTHENTICATION_FAILED: "Autentisering misslyckades",
	UNABLE_TO_CREATE_SESSION: "Kunde inte skapa session",
	FAILED_TO_UPDATE_PASSKEY: "Misslyckades med att uppdatera passnyckel",
	PREVIOUSLY_REGISTERED: "Tidigare registrerad",
	REGISTRATION_CANCELLED: "Registrering avbruten",
	AUTH_CANCELLED: "Autentisering avbruten",
	UNKNOWN_ERROR: "Okänt fel",
	SESSION_REQUIRED: "Registrering av passnyckel kräver en autentiserad session",
	RESOLVE_USER_REQUIRED: "Utmaning hittades inte",
	RESOLVED_USER_INVALID: "Den identifierade användaren är ogiltig",
};
