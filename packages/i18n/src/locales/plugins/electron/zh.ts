import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const zhElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "无效的客户端 ID",
	INVALID_TOKEN: "无效或过期的令牌。",
	STATE_MISMATCH: "状态不匹配 (state mismatch)",
	MISSING_CODE_CHALLENGE: "缺少代码挑战 (code challenge)",
	INVALID_CODE_VERIFIER: "无效的代码验证器",
	MISSING_STATE: "状态 (state) 是必需的",
	MISSING_PKCE: "需要 PKCE",
};
