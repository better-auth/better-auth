import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const viUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Tên đăng nhập hoặc mật khẩu không hợp lệ",
	EMAIL_NOT_VERIFIED: "Email chưa được xác thực",
	UNEXPECTED_ERROR: "Lỗi không xác định",
	USERNAME_IS_ALREADY_TAKEN:
		"Tên đăng nhập đã được sử dụng. Vui lòng thử tên khác.",
	USERNAME_TOO_SHORT: "Tên đăng nhập quá ngắn",
	USERNAME_TOO_LONG: "Tên đăng nhập quá dài",
	INVALID_USERNAME: "Tên đăng nhập không hợp lệ",
	INVALID_DISPLAY_USERNAME: "Tên hiển thị không hợp lệ",
	USERNAME_IS_IMMUTABLE: "Không thể cập nhật tên đăng nhập",
};
