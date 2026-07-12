import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const viDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Mã thiết bị không hợp lệ",
	EXPIRED_DEVICE_CODE: "Mã thiết bị đã hết hạn",
	EXPIRED_USER_CODE: "Mã người dùng đã hết hạn",
	AUTHORIZATION_PENDING: "Đang chờ ủy quyền",
	ACCESS_DENIED: "Truy cập bị từ chối",
	INVALID_USER_CODE: "Mã người dùng không hợp lệ",
	DEVICE_CODE_ALREADY_PROCESSED: "Mã thiết bị đã được xử lý",
	DEVICE_CODE_NOT_CLAIMED:
		"Mã thiết bị chưa được xác nhận bởi phiên xác minh; hãy gọi `GET /device` kèm theo `user_code` khi đã đăng nhập trước khi phê duyệt hoặc từ chối",
	POLLING_TOO_FREQUENTLY: "Gửi yêu cầu quá thường xuyên",
	USER_NOT_FOUND: "Không tìm thấy người dùng",
	FAILED_TO_CREATE_SESSION: "Tạo phiên thất bại",
	INVALID_DEVICE_CODE_STATUS: "Trạng thái mã thiết bị không hợp lệ",
	AUTHENTICATION_REQUIRED: "Yêu cầu xác thực",
};
