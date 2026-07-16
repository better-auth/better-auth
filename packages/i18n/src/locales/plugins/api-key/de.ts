import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const deApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "Metadaten müssen ein Objekt oder undefiniert sein",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount ist erforderlich, wenn refillInterval angegeben wird",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval ist erforderlich, wenn refillAmount angegeben wird",
	USER_BANNED: "Benutzer ist gesperrt",
	UNAUTHORIZED_SESSION: "Ungültige oder nicht autorisierte Sitzung",
	KEY_NOT_FOUND: "API-Schlüssel nicht gefunden",
	KEY_DISABLED: "API-Schlüssel ist deaktiviert",
	KEY_EXPIRED: "API-Schlüssel ist abgelaufen",
	USAGE_EXCEEDED: "API-Schlüssel hat sein Nutzungslimit erreicht",
	KEY_NOT_RECOVERABLE: "API-Schlüssel ist nicht wiederherstellbar",
	EXPIRES_IN_IS_TOO_SMALL:
		"Der Wert für expiresIn is kleiner als der vordefinierte Mindestwert.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Der Wert für expiresIn is größer als der vordefinierte Höchstwert.",
	INVALID_REMAINING:
		"Die verbleibende Anzahl ist entweder zu groß oder zu klein.",
	INVALID_PREFIX_LENGTH: "Die Präfixlänge ist entweder zu groß oder zu klein.",
	INVALID_NAME_LENGTH: "Die Namenslänge ist entweder zu groß oder zu klein.",
	METADATA_DISABLED: "Metadaten sind deaktiviert.",
	RATE_LIMIT_EXCEEDED: "Ratenbegrenzung überschritten.",
	NO_VALUES_TO_UPDATE: "Keine Werte zum Aktualisieren.",
	KEY_DISABLED_EXPIRATION:
		"Benutzerdefinierte Werte für den Ablauf des Schlüssels sind deaktiviert.",
	INVALID_API_KEY: "Ungültiger API-Schlüssel.",
	INVALID_USER_ID_FROM_API_KEY:
		"Die Benutzer-ID aus dem API-Schlüssel ist ungültig.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"Die Referenz-ID aus dem API-Schlüssel ist ungültig.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API-Schlüssel-Getter gab einen ungültigen Schlüsseltyp zurück. Zeichenkette erwartet.",
	SERVER_ONLY_PROPERTY:
		"Die Eigenschaft, die Sie festlegen möchten, kann nur von der Server-Auth-Instanz festgelegt werden.",
	FAILED_TO_UPDATE_API_KEY: "API-Schlüssel konnte nicht aktualisiert werden",
	NAME_REQUIRED: "Name des API-Schlüssels ist erforderlich.",
	ORGANIZATION_ID_REQUIRED:
		"Die Organisations-ID ist für API-Schlüssel im Besitz einer Organisation erforderlich.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Sie sind kein Mitglied der Organisation, der dieser API-Schlüssel gehört.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Sie haben keine Berechtigung, diese Aktion für Organisations-API-Schlüssel durchzuführen.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Keine Standard-API-Schlüssel-Konfiguration gefunden.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Das Organisations-Plugin ist für API-Schlüssel im Besitz einer Organisation erforderlich. Bitte installieren und konfigurieren Sie das Organisations-Plugin.",
};
