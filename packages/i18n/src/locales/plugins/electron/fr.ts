import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const frElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "ID client invalide",
	INVALID_TOKEN: "Jeton invalide ou expiré.",
	STATE_MISMATCH: "Incohérence d'état (state mismatch)",
	MISSING_CODE_CHALLENGE: "Défi de code (code challenge) manquant",
	INVALID_CODE_VERIFIER: "Vérificateur de code invalide",
	MISSING_STATE: "L'état (state) est requis",
	MISSING_PKCE: "PKCE est requis",
};
