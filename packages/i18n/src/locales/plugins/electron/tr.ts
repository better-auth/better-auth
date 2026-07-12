import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const trElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "Geçersiz istemci kimliği",
	INVALID_TOKEN: "Geçersiz veya süresi dolmuş belirteç.",
	STATE_MISMATCH: "Durum uyuşmazlığı (state mismatch)",
	MISSING_CODE_CHALLENGE: "Kod doğrulama sınaması eksik",
	INVALID_CODE_VERIFIER: "Geçersiz kod doğrulayıcı",
	MISSING_STATE: "Durum (state) gereklidir",
	MISSING_PKCE: "PKCE gereklidir",
};
