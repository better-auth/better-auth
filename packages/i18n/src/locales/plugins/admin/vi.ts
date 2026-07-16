import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const viAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Tạo người dùng thất bại",
	USER_ALREADY_EXISTS: "Người dùng đã tồn tại.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Người dùng đã tồn tại. Vui lòng dùng email khác.",
	YOU_CANNOT_BAN_YOURSELF: "Bạn không thể tự cấm chính mình",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Bạn không được phép thay đổi vai trò người dùng",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Bạn không được phép tạo người dùng",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Bạn không được phép xem danh sách người dùng",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Bạn không được phép xem danh sách phiên của người dùng",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Bạn không được phép cấm người dùng",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Bạn không được phép mạo danh người dùng",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Bạn không được phép thu hồi phiên của người dùng",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "Bạn không được phép xóa người dùng",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Bạn không được phép đặt mật khẩu người dùng",
	BANNED_USER: "Bạn đã bị cấm khỏi ứng dụng này",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER:
		"Bạn không được phép lấy thông tin người dùng",
	NO_DATA_TO_UPDATE: "Không có dữ liệu nào để cập nhật",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Bạn không được phép cập nhật người dùng",
	YOU_CANNOT_REMOVE_YOURSELF: "Bạn không thể tự xóa chính mình",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Bạn không được phép thiết lập giá trị vai trò không tồn tại",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Bạn không thể mạo danh quản trị viên",
	INVALID_ROLE_TYPE: "Loại vai trò không hợp lệ",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Bạn không được phép cập nhật email của người dùng",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Mật khẩu không thể cập nhật thông qua cập nhật người dùng. Hãy dùng điểm cuối set-user-password thay thế",
};
