import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const dePasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Challenge nicht gefunden",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Sie dürfen diesen Passkey nicht registrieren",
	FAILED_TO_VERIFY_REGISTRATION: "Registrierungsverifizierung fehlgeschlagen",
	PASSKEY_NOT_FOUND: "Passkey nicht gefunden",
	AUTHENTICATION_FAILED: "Authentifizierung fehlgeschlagen",
	UNABLE_TO_CREATE_SESSION: "Sitzung konnte nicht erstellt werden",
	FAILED_TO_UPDATE_PASSKEY: "Passkey konnte nicht aktualisiert werden",
	PREVIOUSLY_REGISTERED: "Bereits registriert",
	REGISTRATION_CANCELLED: "Registrierung abgebrochen",
	AUTH_CANCELLED: "Authentifizierung abgebrochen",
	UNKNOWN_ERROR: "Unbekannter Fehler",
	SESSION_REQUIRED:
		"Die Passkey-Registrierung erfordert eine authentifizierte Sitzung",
	RESOLVE_USER_REQUIRED:
		"Die Passkey-Registrierung erfordert entweder eine authentifizierte Sitzung oder einen resolveUser-Callback, wenn requireSession false ist",
	RESOLVED_USER_INVALID: "Aufgelöster Benutzer ist ungültig",
};
