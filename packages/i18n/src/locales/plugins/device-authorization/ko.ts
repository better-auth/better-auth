import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const koDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "유효하지 않은 기기 코드",
	EXPIRED_DEVICE_CODE: "기기 코드가 만료되었습니다",
	EXPIRED_USER_CODE: "사용자 코드가 만료되었습니다",
	AUTHORIZATION_PENDING: "권한 부여 대기 중",
	ACCESS_DENIED: "접근 거부됨",
	INVALID_USER_CODE: "유효하지 않은 사용자 코드",
	DEVICE_CODE_ALREADY_PROCESSED: "이미 처리된 기기 코드입니다",
	DEVICE_CODE_NOT_CLAIMED:
		"기기 코드가 확인 세션에 의해 청구되지 않았습니다. 승인 또는 거부하기 전에 로그인한 상태에서 `user_code`와 함께 `GET /device`를 호출하십시오",
	POLLING_TOO_FREQUENTLY: "폴링 요청이 너무 빈번합니다",
	USER_NOT_FOUND: "사용자를 찾을 수 없습니다",
	FAILED_TO_CREATE_SESSION: "세션 생성에 실패했습니다",
	INVALID_DEVICE_CODE_STATUS: "유효하지 않은 기기 코드 상태",
	AUTHENTICATION_REQUIRED: "인증이 필요합니다",
};
