import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const enElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Invalid client ID",
	INVALID_TOKEN: "Invalid or expired token.",
	STATE_MISMATCH: "state mismatch",
	MISSING_CODE_CHALLENGE: "missing code challenge",
	INVALID_CODE_VERIFIER: "Invalid code verifier",
	MISSING_STATE: "state is required",
	MISSING_PKCE: "pkce is required",
};
