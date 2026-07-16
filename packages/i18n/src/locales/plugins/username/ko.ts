import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const koUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "사용자 이름 또는 비밀번호가 잘못되었습니다",
	EMAIL_NOT_VERIFIED: "이메일이 인증되지 않았습니다",
	UNEXPECTED_ERROR: "예기치 않은 오류가 발생했습니다",
	USERNAME_IS_ALREADY_TAKEN:
		"이미 사용 중인 사용자 이름입니다. 다른 이름을 입력하세요.",
	USERNAME_TOO_SHORT: "사용자 이름이 너무 짧습니다",
	USERNAME_TOO_LONG: "사용자 이름이 너무 깁니다",
	INVALID_USERNAME: "유효하지 않은 사용자 이름입니다",
	INVALID_DISPLAY_USERNAME: "유효하지 않은 표시 이름입니다",
	USERNAME_IS_IMMUTABLE: "사용자 이름을 변경할 수 없습니다",
};
