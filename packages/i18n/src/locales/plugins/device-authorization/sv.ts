import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const svDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Ogiltig enhetskod",
	EXPIRED_DEVICE_CODE: "Enhetskoden har gått ut",
	EXPIRED_USER_CODE: "Användarkoden har gått ut",
	AUTHORIZATION_PENDING: "Auktorisering väntar",
	ACCESS_DENIED: "Åtkomst nekad",
	INVALID_USER_CODE: "Ogiltig användarkod",
	DEVICE_CODE_ALREADY_PROCESSED: "Enhetskoden har redan behandlats",
	DEVICE_CODE_NOT_CLAIMED:
		"Enhetskoden har inte gjorts anspråk på av en verifierande session; anropa `GET /device` med `user_code` medan du är inloggad innan du godkänner eller avvisar",
	POLLING_TOO_FREQUENTLY: "Begäran skickas för ofta",
	USER_NOT_FOUND: "Användaren hittades inte",
	FAILED_TO_CREATE_SESSION: "Det gick inte att skapa session",
	INVALID_DEVICE_CODE_STATUS: "Ogiltig enhetskodsstatus",
	AUTHENTICATION_REQUIRED: "Autentisering krävs",
};
