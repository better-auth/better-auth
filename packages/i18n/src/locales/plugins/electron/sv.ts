import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const svElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Ogiltigt klient-ID",
	INVALID_TOKEN: "Ogiltigt eller utgånget token.",
	STATE_MISMATCH: "Status stämmer inte överens (state mismatch)",
	MISSING_CODE_CHALLENGE: "Kodutmaning (code challenge) saknas",
	INVALID_CODE_VERIFIER: "Ogiltig kodverifierare",
	MISSING_STATE: "Status (state) krävs",
	MISSING_PKCE: "PKCE krävs",
};
