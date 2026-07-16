import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const plApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE:
		"metadane muszą być obiektem lub wartością niezdefiniowaną",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount jest wymagane, gdy podano refillInterval",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval jest wymagane, gdy podano refillAmount",
	USER_BANNED: "Użytkownik jest zablokowany",
	UNAUTHORIZED_SESSION: "Nieautoryzowana lub nieprawidłowa sesja",
	KEY_NOT_FOUND: "Nie znaleziono klucza API",
	KEY_DISABLED: "Klucz API jest wyłączony",
	KEY_EXPIRED: "Klucz API wygasł",
	USAGE_EXCEEDED: "Klucz API osiągnął limit użycia",
	KEY_NOT_RECOVERABLE: "Klucz API jest nieodzyskiwalny",
	EXPIRES_IN_IS_TOO_SMALL:
		"Wartość expiresIn jest mniejsza niż zdefiniowana wartość minimalna.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Wartość expiresIn jest większa niż zdefiniowana wartość maksymalna.",
	INVALID_REMAINING: "Pozostała liczba jest zbyt duża lub zbyt mała.",
	INVALID_PREFIX_LENGTH: "Długość prefiksu jest zbyt duża lub zbyt mała.",
	INVALID_NAME_LENGTH: "Długość nazwy jest zbyt duża lub zbyt mała.",
	METADATA_DISABLED: "Metadane są wyłączone.",
	RATE_LIMIT_EXCEEDED: "Przekroczono limit zapytań.",
	NO_VALUES_TO_UPDATE: "Brak wartości do aktualizacji.",
	KEY_DISABLED_EXPIRATION:
		"Niestandardowe wartości wygasania klucza są wyłączone.",
	INVALID_API_KEY: "Nieprawidłowy klucz API.",
	INVALID_USER_ID_FROM_API_KEY:
		"Identyfikator użytkownika z klucza API jest nieprawidłowy.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"Identyfikator referencyjny z klucza API jest nieprawidłowy.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Getter klucza API zwrócił nieprawidłowy typ klucza. Oczekiwano ciągu znaków.",
	SERVER_ONLY_PROPERTY:
		"Właściwość, którą próbujesz ustawić, może być skonfigurowana tylko z poziomu instancji uwierzytelniania serwera.",
	FAILED_TO_UPDATE_API_KEY: "Aktualizacja klucza API nie powiodła się",
	NAME_REQUIRED: "Nazwa klucza API jest wymagana.",
	ORGANIZATION_ID_REQUIRED:
		"Identyfikator organizacji jest wymagany dla kluczy API należących do organizacji.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Nie jesteś członkiem organizacji, która jest właścicielem tego klucza API.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Nie masz uprawnień do wykonania tej operacji na kluczach API organizacji.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Nie znaleziono domyślnej konfiguracji klucza API.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Wtyczka organizacji jest wymagana dla kluczy API należących do organizacji. Zainstaluj i skonfiguruj wtyczkę organizacji.",
};
