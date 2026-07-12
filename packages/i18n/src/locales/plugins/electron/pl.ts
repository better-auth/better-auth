import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const plElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Nieprawidłowy identyfikator klienta",
	INVALID_TOKEN: "Nieprawidłowy lub wygasły token.",
	STATE_MISMATCH: "Niezgodność stanu (state mismatch)",
	MISSING_CODE_CHALLENGE: "Brak wyzwania kodu (code challenge)",
	INVALID_CODE_VERIFIER: "Nieprawidłowy weryfikator kodu",
	MISSING_STATE: "Stan (state) jest wymagany",
	MISSING_PKCE: "PKCE jest wymagane",
};
