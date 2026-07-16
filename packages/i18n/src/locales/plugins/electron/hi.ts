import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const hiElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "अमान्य क्लाइंट आईडी",
	INVALID_TOKEN: "अमान्य या समाप्त टोकन।",
	STATE_MISMATCH: "स्थिति बेमेल (state mismatch)",
	MISSING_CODE_CHALLENGE: "कोड चुनौती (code challenge) गायब है",
	INVALID_CODE_VERIFIER: "अमान्य कोड सत्यापनकर्ता",
	MISSING_STATE: "स्थिति (state) आवश्यक है",
	MISSING_PKCE: "PKCE आवश्यक है",
};
