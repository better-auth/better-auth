import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const itPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Sfida non trovata",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Non sei autorizzato a registrare questa passkey",
	FAILED_TO_VERIFY_REGISTRATION: "Impossibile verificare la registrazione",
	PASSKEY_NOT_FOUND: "Passkey non trovata",
	AUTHENTICATION_FAILED: "Autenticazione fallita",
	UNABLE_TO_CREATE_SESSION: "Impossibile creare la sessione",
	FAILED_TO_UPDATE_PASSKEY: "Impossibile aggiornare la passkey",
	PREVIOUSLY_REGISTERED: "Registrata in precedenza",
	REGISTRATION_CANCELLED: "Registrazione annullata",
	AUTH_CANCELLED: "Autenticazione annullata",
	UNKNOWN_ERROR: "Errore sconosciuto",
	SESSION_REQUIRED:
		"La registrazione della passkey richiede una sessione autenticata",
	RESOLVE_USER_REQUIRED:
		"La registrazione della passkey richiede una sessione autenticata o una callback resolveUser quando requireSession è false",
	RESOLVED_USER_INVALID: "L'utente risolto non è valido",
};
