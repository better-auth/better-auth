import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const viElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "ID ứng dụng không hợp lệ",
	INVALID_TOKEN: "Mã xác thực không hợp lệ hoặc đã hết hạn.",
	STATE_MISMATCH: "Trạng thái không khớp (state mismatch)",
	MISSING_CODE_CHALLENGE: "Thiếu code challenge",
	INVALID_CODE_VERIFIER: "Trình xác minh mã không hợp lệ",
	MISSING_STATE: "Trạng thái (state) là bắt buộc",
	MISSING_PKCE: "Yêu cầu PKCE",
};
