import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const jaElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "無効なクライアントID",
	INVALID_TOKEN: "無効または期限切れのトークンです。",
	STATE_MISMATCH: "ステートの不一致",
	MISSING_CODE_CHALLENGE: "コードチャレンジがありません",
	INVALID_CODE_VERIFIER: "無効なコードベリファイア",
	MISSING_STATE: "ステートは必須です",
	MISSING_PKCE: "PKCEは必須です",
};
