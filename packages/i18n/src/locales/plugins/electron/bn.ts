import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const bnElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "অবৈধ ক্লায়েন্ট আইডি",
	INVALID_TOKEN: "টোকেনটি অবৈধ বা মেয়াদোত্তীর্ণ।",
	STATE_MISMATCH: "স্টেট অমিল",
	MISSING_CODE_CHALLENGE: "কোড চ্যালেঞ্জ অনুপস্থিত",
	INVALID_CODE_VERIFIER: "অবৈধ কোড ভেরিফায়ার",
	MISSING_STATE: "স্টেট প্রয়োজন",
	MISSING_PKCE: "PKCE প্রয়োজন",
};
