import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const viApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "metadata phải là một đối tượng hoặc không xác định",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount là bắt buộc khi refillInterval được cung cấp",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval là bắt buộc khi refillAmount được cung cấp",
	USER_BANNED: "Người dùng đã bị cấm",
	UNAUTHORIZED_SESSION: "Phiên không được xác thực hoặc không hợp lệ",
	KEY_NOT_FOUND: "Không tìm thấy khóa API",
	KEY_DISABLED: "Khóa API đã bị vô hiệu hóa",
	KEY_EXPIRED: "Khóa API đã hết hạn",
	USAGE_EXCEEDED: "Khóa API đã đạt đến giới hạn sử dụng",
	KEY_NOT_RECOVERABLE: "Khóa API không thể phục hồi",
	EXPIRES_IN_IS_TOO_SMALL:
		"Giá trị expiresIn nhỏ hơn giá trị tối thiểu đã được thiết lập trước.",
	EXPIRES_IN_IS_TOO_LARGE:
		"Giá trị expiresIn lớn hơn giá trị tối đa đã được thiết lập trước.",
	INVALID_REMAINING: "Số lượt còn lại quá lớn hoặc quá nhỏ.",
	INVALID_PREFIX_LENGTH: "Độ dài tiền tố quá lớn hoặc quá nhỏ.",
	INVALID_NAME_LENGTH: "Độ dài tên quá lớn hoặc quá nhỏ.",
	METADATA_DISABLED: "Metadata đã bị vô hiệu hóa.",
	RATE_LIMIT_EXCEEDED: "Đã vượt quá giới hạn tần suất.",
	NO_VALUES_TO_UPDATE: "Không có giá trị nào để cập nhật.",
	KEY_DISABLED_EXPIRATION:
		"Giá trị hết hạn tùy chỉnh của khóa đã bị vô hiệu hóa.",
	INVALID_API_KEY: "Khóa API không hợp lệ.",
	INVALID_USER_ID_FROM_API_KEY: "ID người dùng từ khóa API không hợp lệ.",
	INVALID_REFERENCE_ID_FROM_API_KEY: "ID tham chiếu từ khóa API không hợp lệ.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"Getter khóa API đã trả về một kiểu khóa không hợp lệ. Mong đợi một chuỗi.",
	SERVER_ONLY_PROPERTY:
		"Thuộc tính bạn đang cố gắng đặt chỉ có thể được thiết lập từ phiên bản xác thực của máy chủ.",
	FAILED_TO_UPDATE_API_KEY: "Cập nhật khóa API thất bại",
	NAME_REQUIRED: "Tên khóa API là bắt buộc.",
	ORGANIZATION_ID_REQUIRED:
		"ID tổ chức là bắt buộc đối với các khóa API do tổ chức sở hữu.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Bạn không phải là thành viên của tổ chức sở hữu khóa API này.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Bạn không có quyền thực hiện hành động này trên các khóa API của tổ chức.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Không tìm thấy cấu hình khóa API mặc định.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"Plugin tổ chức là bắt buộc đối với các khóa API do tổ chức sở hữu. Vui lòng cài đặt và cấu hình plugin tổ chức.",
};
