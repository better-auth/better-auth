import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const nlApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata moet een object of ongedefinieerd zijn",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount is vereist wanneer refillInterval is opgegeven",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval is vereist wanneer refillAmount is opgegeven",
	USER_BANNED: "Gebruiker is verbannen",
	UNAUTHORIZED_SESSION: "Niet-geautoriseerde of ongeldige sessie",
	KEY_NOT_FOUND: "API-sleutel niet gevonden",
	KEY_DISABLED: "API-sleutel is uitgeschakeld",
	KEY_EXPIRED: "API-sleutel is verlopen",
	USAGE_EXCEEDED: "API-sleutel heeft de gebruikslimiet bereikt",
	KEY_NOT_RECOVERABLE: "API-sleutel is niet herstelbaar",
	EXPIRES_IN_IS_TOO_SMALL:
		"De waarde van expiresIn is kleiner dan de vooraf gedefinieerde minimumwaarde.",
	EXPIRES_IN_IS_TOO_LARGE:
		"De waarde van expiresIn is groter dan de vooraf gedefinieerde maximumwaarde.",
	INVALID_REMAINING: "Het resterende aantal is te groot of te klein.",
	INVALID_PREFIX_LENGTH: "De voorvoegsellengte is te groot of te klein.",
	INVALID_NAME_LENGTH: "De naamlengte is te groot of te klein.",
	METADATA_DISABLED: "Metadata is uitgeschakeld.",
	RATE_LIMIT_EXCEEDED: "Tarieflimiet overschreden.",
	NO_VALUES_TO_UPDATE: "Geen waarden om bij te werken.",
	KEY_DISABLED_EXPIRATION:
		"Aangepaste sleutelverloopwaarden zijn uitgeschakeld.",
	INVALID_API_KEY: "Ongeldige API-sleutel.",
	INVALID_USER_ID_FROM_API_KEY:
		"De gebruikers-ID van de API-sleutel is ongeldig.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"De referentie-ID van de API-sleutel is ongeldig.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API-sleutel getter retourneerde een ongeldig sleuteltype. String verwacht.",
	SERVER_ONLY_PROPERTY:
		"De eigenschap die u probeert in te stellen kan alleen worden geconfigureerd vanaf de server-auth-instantie.",
	FAILED_TO_UPDATE_API_KEY: "Bijwerken API-sleutel mislukt",
	NAME_REQUIRED: "Naam van de API-sleutel is vereist.",
	ORGANIZATION_ID_REQUIRED:
		"Organisatie-ID is vereist voor API-sleutels van een organisatie.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"U bent geen lid van de organisatie die eigenaar is van deze API-sleutel.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"U hebt geen toestemming om deze actie uit te voeren op organisatie API-sleutels.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Geen standaard API-sleutelconfiguratie gevonden.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Organisatie-plugin is vereist voor API-sleutels van een organisatie. Installeer en configureer de organisatie-plugin.",
};
