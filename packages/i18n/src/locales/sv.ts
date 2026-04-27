import type { TranslationDictionary } from "../types";

/**
 * Swedish translations
 */
export const sv: TranslationDictionary = {
	USER_NOT_FOUND: "Användare hittades inte",
	FAILED_TO_CREATE_USER: "Misslyckades med att skapa användare",
	FAILED_TO_CREATE_SESSION: "Misslyckades med att skapa session",
	FAILED_TO_UPDATE_USER: "Misslyckades med att uppdatera användare",
	FAILED_TO_GET_SESSION: "Misslyckades med att hämta session",
	INVALID_PASSWORD: "Ogiltigt lösenord",
	INVALID_EMAIL: "Ogiltig e-postadress",
	INVALID_EMAIL_OR_PASSWORD: "Ogiltig e-postadress eller lösenord",
	INVALID_USER: "Ogiltig användare",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Socialt konto redan länkat",
	PROVIDER_NOT_FOUND: "Leverantör hittades inte",
	INVALID_TOKEN: "Ogiltigt token",
	TOKEN_EXPIRED: "Token har gått ut",
	FAILED_TO_GET_USER_INFO:
		"Misslyckades med att hämta användarinformation",
	USER_EMAIL_NOT_FOUND: "Användarens e-postadress hittades inte",
	EMAIL_NOT_VERIFIED: "E-postadressen är inte verifierad",
	PASSWORD_TOO_SHORT: "Lösenordet är för kort",
	PASSWORD_TOO_LONG: "Lösenordet är för långt",
	USER_ALREADY_EXISTS: "Användaren finns redan",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Användaren finns redan. Använd en annan e-postadress.",
	EMAIL_CAN_NOT_BE_UPDATED: "E-postadressen kan inte uppdateras",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Inloggningskontot hittades inte",
	SESSION_EXPIRED:
		"Sessionen har gått ut. Autentisera dig igen för att utföra denna åtgärd.",
	FAILED_TO_UNLINK_LAST_ACCOUNT:
		"Du kan inte ta bort länken till ditt sista konto",
	ACCOUNT_NOT_FOUND: "Kontot hittades inte",
	USER_ALREADY_HAS_PASSWORD:
		"Användaren har redan ett lösenord. Ange det för att ta bort kontot.",
	VERIFICATION_EMAIL_NOT_ENABLED: "Verifieringsmail är inte aktiverat",
	EMAIL_ALREADY_VERIFIED: "E-postadressen är redan verifierad",
	EMAIL_MISMATCH: "E-postadresserna stämmer inte överens",
	SESSION_NOT_FRESH: "Sessionen är inte aktuell",
	LINKED_ACCOUNT_ALREADY_EXISTS: "Det länkade kontot finns redan",
	VALIDATION_ERROR: "Valideringsfel",
	MISSING_FIELD: "Det här fältet är obligatoriskt",
	PASSWORD_ALREADY_SET: "Användaren har redan ett lösenord inställt",
};
