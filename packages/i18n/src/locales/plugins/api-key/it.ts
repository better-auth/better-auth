import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const itApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "i metadati devono essere un oggetto o non definiti",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount è richiesto quando viene fornito refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval è richiesto quando viene fornito refillAmount",
	USER_BANNED: "L'utente è bandito",
	UNAUTHORIZED_SESSION: "Sessione non autorizzata o non valida",
	KEY_NOT_FOUND: "Chiave API non trovata",
	KEY_DISABLED: "La chiave API è disabilitata",
	KEY_EXPIRED: "La chiave API è scaduta",
	USAGE_EXCEEDED: "La chiave API ha raggiunto il limite di utilizzo",
	KEY_NOT_RECOVERABLE: "La chiave API non è recuperável",
	EXPIRES_IN_IS_TOO_SMALL:
		"Il valore expiresIn è inferiore al valore minimo predefinito.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Il valore expiresIn è superiore al valore massimo predefinito.",
	INVALID_REMAINING: "Il conteggio rimanente è troppo grande o troppo piccolo.",
	INVALID_PREFIX_LENGTH:
		"La lunghezza del prefisso è troppo grande o troppo piccola.",
	INVALID_NAME_LENGTH:
		"La lunghezza del nome è troppo grande o troppo piccola.",
	METADATA_DISABLED: "I metadati sono disabilitati.",
	RATE_LIMIT_EXCEEDED: "Limite di velocità superato.",
	NO_VALUES_TO_UPDATE: "Nessun valore da aggiornare.",
	KEY_DISABLED_EXPIRATION:
		"I valori di scadenza della chiave personalizzati sono disabilitati.",
	INVALID_API_KEY: "Chiave API non valida.",
	INVALID_USER_ID_FROM_API_KEY: "L'ID utente della chiave API non è valido.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"L'ID di riferimento della chiave API non è valido.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Il getter della chiave API ha restituito un tipo di chiave non valido. Atteso stringa.",
	SERVER_ONLY_PROPERTY:
		"La proprietà che stai tentando di impostare può essere configurata solo dall'istanza di autenticazione del server.",
	FAILED_TO_UPDATE_API_KEY: "Impossibile aggiornare la chiave API",
	NAME_REQUIRED: "Il nome della chiave API è richiesto.",
	ORGANIZATION_ID_REQUIRED:
		"L'ID dell'organizzazione è richiesto per le chiavi API di proprietà dell'organizzazione.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Non sei un membro dell'organizzazione che possiede questa chiave API.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Non hai i permessi per eseguire questa azione sulle chiavi API dell'organizzazione.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Nessuna configurazione della chiave API predefinita trovata.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Il plugin di organizzazione è richiesto per le chiavi API di proprietà dell'organizzazione. Installa e configura il plugin di organizzazione.",
};
