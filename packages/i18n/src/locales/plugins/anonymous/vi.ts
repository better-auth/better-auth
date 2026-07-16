import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const viAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "Email không được tạo ở định dạng hợp lệ",
		FAILED_TO_CREATE_USER: "Tạo người dùng thất bại",
		COULD_NOT_CREATE_SESSION: "Không thể tạo phiên làm việc",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Người dùng ẩn danh không thể đăng nhập ẩn danh lại",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Xóa người dùng ẩn danh thất bại",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Xóa phiên làm việc của người dùng ẩn danh thất bại",
		USER_IS_NOT_ANONYMOUS: "Người dùng không ẩn danh",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Tính năng xóa người dùng ẩn danh bị vô hiệu hóa",
	};
