import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const itElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "ID client non valido",
	INVALID_TOKEN: "Token non valido o scaduto.",
	STATE_MISMATCH: "Mancata corrispondenza dello stato (state mismatch)",
	MISSING_CODE_CHALLENGE: "Sfida del codice (code challenge) mancante",
	INVALID_CODE_VERIFIER: "Verificatore di codice non valido",
	MISSING_STATE: "Lo stato (state) è richiesto",
	MISSING_PKCE: "Il PKCE è richiesto",
};
