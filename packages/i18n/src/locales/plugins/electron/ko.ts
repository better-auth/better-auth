import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const koElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "올바르지 않은 클라이언트 ID",
	INVALID_TOKEN: "올바르지 않거나 만료된 토큰입니다.",
	STATE_MISMATCH: "상태(state)가 일치하지 않습니다",
	MISSING_CODE_CHALLENGE: "코드 챌린지(code challenge)가 누락되었습니다",
	INVALID_CODE_VERIFIER: "올바르지 않은 코드 검증기(code verifier)",
	MISSING_STATE: "상태(state)가 필요합니다",
	MISSING_PKCE: "PKCE가 필요합니다",
};
