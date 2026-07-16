import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const esElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "ID de cliente no válido",
	INVALID_TOKEN: "Token no válido o caducado.",
	STATE_MISMATCH: "Discrepancia de estado (state mismatch)",
	MISSING_CODE_CHALLENGE: "Falta el desafío de código (code challenge)",
	INVALID_CODE_VERIFIER: "Verificador de código no válido",
	MISSING_STATE: "El estado (state) es obligatorio",
	MISSING_PKCE: "Se requiere PKCE",
};
