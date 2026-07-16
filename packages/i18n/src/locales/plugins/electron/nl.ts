import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const nlElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Ongeldig client-ID",
	INVALID_TOKEN: "Ongeldig of verlopen token.",
	STATE_MISMATCH: "Status komt niet overeen (state mismatch)",
	MISSING_CODE_CHALLENGE: "Code challenge ontbreekt",
	INVALID_CODE_VERIFIER: "Ongeldige code verifier",
	MISSING_STATE: "Status (state) is vereist",
	MISSING_PKCE: "PKCE is vereist",
};
