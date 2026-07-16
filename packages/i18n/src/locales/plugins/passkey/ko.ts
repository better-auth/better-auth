import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const koPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "챌린지를 찾을 수 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"이 패스키를 등록할 권한이 없습니다",
	FAILED_TO_VERIFY_REGISTRATION: "등록 확인에 실패했습니다",
	PASSKEY_NOT_FOUND: "패스키를 찾을 수 없습니다",
	AUTHENTICATION_FAILED: "인증에 실패했습니다",
	UNABLE_TO_CREATE_SESSION: "세션을 생성할 수 없습니다",
	FAILED_TO_UPDATE_PASSKEY: "패스키 업데이트에 실패했습니다",
	PREVIOUSLY_REGISTERED: "이미 등록되었습니다",
	REGISTRATION_CANCELLED: "등록이 취소되었습니다",
	AUTH_CANCELLED: "인증이 취소되었습니다",
	UNKNOWN_ERROR: "알 수 없는 오류가 발생했습니다",
	SESSION_REQUIRED: "패스키 등록을 위해서는 인증된 세션이 필요합니다",
	RESOLVE_USER_REQUIRED:
		"requireSession이 false일 때 패스키 등록을 하려면 인증된 세션 또는 resolveUser 콜백 중 하나가 필요합니다",
	RESOLVED_USER_INVALID: "확인된 사용자가 올바르지 않습니다",
};
