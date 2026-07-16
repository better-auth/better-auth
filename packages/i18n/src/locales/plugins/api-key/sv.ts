import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const svApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata måste vara ett objekt eller odefinierat",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount krävs när refillInterval tillhandahålls",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval krävs när refillAmount tillhandahålls",
	USER_BANNED: "Användaren är avstängd",
	UNAUTHORIZED_SESSION: "Obehörig eller ogiltig session",
	KEY_NOT_FOUND: "API-nyckel hittades inte",
	KEY_DISABLED: "API-nyckel är inaktiverad",
	KEY_EXPIRED: "API-nyckel har gått ut",
	USAGE_EXCEEDED: "API-nyckel har nått sin användningsgräns",
	KEY_NOT_RECOVERABLE: "API-nyckel är inte återställningsbar",
	EXPIRES_IN_IS_TOO_SMALL:
		"expiresIn är mindre än det fördefinierade minimivärdet.",
	EXPIRES_IN_IS_TOO_LARGE:
		"expiresIn är större än det fördefinierade maximivärdet.",
	INVALID_REMAINING:
		"Det kvarvarande antalet är antingen för stort eller för litet.",
	INVALID_PREFIX_LENGTH: "Prefixlängden är antingen för stor eller för liten.",
	INVALID_NAME_LENGTH: "Namnlängden är antingen för stor eller för liten.",
	METADATA_DISABLED: "Metadata är inaktiverad.",
	RATE_LIMIT_EXCEEDED: "Hastighetsbegränsning överskriden.",
	NO_VALUES_TO_UPDATE: "Inga värden att uppdatera.",
	KEY_DISABLED_EXPIRATION:
		"Anpassade värden för nyckelns utgångstid är inaktiverade.",
	INVALID_API_KEY: "Ogiltig API-nyckel.",
	INVALID_USER_ID_FROM_API_KEY: "Användar-ID från API-nyckeln är ogiltigt.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"Referens-ID från API-nyckeln är ogiltigt.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API-nyckelns getter returnerade en ogiltig nyckeltyp. Sträng förväntades.",
	SERVER_ONLY_PROPERTY:
		"Egenskapen du försöker sätta kan endast ställas in från serverns autentiseringsinstans.",
	FAILED_TO_UPDATE_API_KEY: "Misslyckades med att uppdatera API-nyckel",
	NAME_REQUIRED: "API-nyckelns namn krävs.",
	ORGANIZATION_ID_REQUIRED:
		"Organisations-ID krävs för API-nycklar som ägs av en organisation.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Du är inte medlem i organisationen som äger denna API-nyckel.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Du har inte tillåtelse att utföra denna åtgärd på organisationens API-nycklar.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Ingen standardkonfiguration för API-nycklar hittades.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Organisationsplugin krävs för API-nycklar som ägs av en organisation. Installera och konfigurera organisationspluginen.",
};
