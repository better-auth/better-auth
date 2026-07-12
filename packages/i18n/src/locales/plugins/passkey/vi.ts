import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const viPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Không tìm thấy thử thách",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Bạn không được phép đăng ký passkey này",
	FAILED_TO_VERIFY_REGISTRATION: "Xác minh đăng ký thất bại",
	PASSKEY_NOT_FOUND: "Không tìm thấy passkey",
	AUTHENTICATION_FAILED: "Xác thực thất bại",
	UNABLE_TO_CREATE_SESSION: "Không thể tạo phiên",
	FAILED_TO_UPDATE_PASSKEY: "Cập nhật passkey thất bại",
	PREVIOUSLY_REGISTERED: "Đã đăng ký trước đó",
	REGISTRATION_CANCELLED: "Đã hủy đăng ký",
	AUTH_CANCELLED: "Đã hủy xác thực",
	UNKNOWN_ERROR: "Lỗi không xác định",
	SESSION_REQUIRED: "Đăng ký passkey yêu cầu một phiên đã được xác thực",
	RESOLVE_USER_REQUIRED:
		"Đăng ký passkey yêu cầu một phiên đã được xác thực hoặc một callback resolveUser khi requireSession là false",
	RESOLVED_USER_INVALID: "Người dùng được xác định không hợp lệ",
};
