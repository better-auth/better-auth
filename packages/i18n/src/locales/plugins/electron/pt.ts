import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const ptElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "ID de cliente inválido",
	INVALID_TOKEN: "Token inválido ou expirado.",
	STATE_MISMATCH: "Incompatibilidade de estado (state mismatch)",
	MISSING_CODE_CHALLENGE: "Desafio de código (code challenge) em falta",
	INVALID_CODE_VERIFIER: "Verificador de código inválido",
	MISSING_STATE: "O estado (state) é obrigatório",
	MISSING_PKCE: "PKCE é obrigatório",
};
