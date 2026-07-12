import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const nlPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Challenge niet gevonden",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"U bent niet gemachtigd om deze passkey te registreren",
	FAILED_TO_VERIFY_REGISTRATION: "Registratieverificatie mislukt",
	PASSKEY_NOT_FOUND: "Passkey niet gevonden",
	AUTHENTICATION_FAILED: "Authenticatie mislukt",
	UNABLE_TO_CREATE_SESSION: "Kan sessie niet maken",
	FAILED_TO_UPDATE_PASSKEY: "Bijwerken passkey mislukt",
	PREVIOUSLY_REGISTERED: "Eerder geregistreerd",
	REGISTRATION_CANCELLED: "Registratie geannuleerd",
	AUTH_CANCELLED: "Authenticatie geannuleerd",
	UNKNOWN_ERROR: "Onbekende fout",
	SESSION_REQUIRED: "Passkey-registratie vereist een geauthenticeerde sessie",
	RESOLVE_USER_REQUIRED:
		"Passkey-registratie vereist een geauthenticeerde sessie of een resolveUser-callback wanneer requireSession false is",
	RESOLVED_USER_INVALID: "Opgeloste gebruiker is ongeldig",
};
