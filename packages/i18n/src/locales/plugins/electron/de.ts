import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const deElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Ungültige Client-ID",
	INVALID_TOKEN: "Ungültiges oder abgelaufenes Token.",
	STATE_MISMATCH: "Statusabweichung (State Mismatch)",
	MISSING_CODE_CHALLENGE: "Fehlende Code-Challenge",
	INVALID_CODE_VERIFIER: "Ungültiger Code-Verifier",
	MISSING_STATE: "Status (State) ist erforderlich",
	MISSING_PKCE: "PKCE ist erforderlich",
};
