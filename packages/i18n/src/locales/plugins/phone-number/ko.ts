import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const koPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "유효하지 않은 전화번호입니다",
	PHONE_NUMBER_EXIST: "이미 존재하는 전화번호입니다",
	PHONE_NUMBER_NOT_EXIST: "등록되지 않은 전화번호입니다",
	INVALID_PHONE_NUMBER_OR_PASSWORD:
		"전화번호 또는 비밀번호가 유효하지 않습니다",
	UNEXPECTED_ERROR: "예기치 않은 오류가 발생했습니다",
	OTP_NOT_FOUND: "OTP를 찾을 수 없습니다",
	OTP_EXPIRED: "OTP가 만료되었습니다",
	INVALID_OTP: "유효하지 않은 OTP입니다",
	PHONE_NUMBER_NOT_VERIFIED: "전화번호가 인증되지 않았습니다",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "전화번호를 업데이트할 수 없습니다",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP가 구현되지 않았습니다",
	TOO_MANY_ATTEMPTS: "시도 횟수가 너무 많습니다. 나중에 다시 시도하세요.",
};
