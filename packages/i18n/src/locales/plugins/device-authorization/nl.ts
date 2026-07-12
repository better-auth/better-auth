import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const nlDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Ongeldige apparaatcode",
	EXPIRED_DEVICE_CODE: "Apparaatcode is verlopen",
	EXPIRED_USER_CODE: "Gebruikerscode is verlopen",
	AUTHORIZATION_PENDING: "Autorisatie in behandeling",
	ACCESS_DENIED: "Toegang geweigerd",
	INVALID_USER_CODE: "Ongeldige gebruikerscode",
	DEVICE_CODE_ALREADY_PROCESSED: "Apparaatcode is al verwerkt",
	DEVICE_CODE_NOT_CLAIMED:
		"Apparaatcode is niet geclaimd door een verificatiesessie; roep `GET /device` aan met de `user_code` terwijl u bent aangemeld, voordat u goedkeurt of weigert",
	POLLING_TOO_FREQUENTLY: "Te vaak gepolld",
	USER_NOT_FOUND: "Gebruiker niet gevonden",
	FAILED_TO_CREATE_SESSION: "Mislukt om sessie te creëren",
	INVALID_DEVICE_CODE_STATUS: "Ongeldige status van apparaatcode",
	AUTHENTICATION_REQUIRED: "Authenticatie vereist",
};
