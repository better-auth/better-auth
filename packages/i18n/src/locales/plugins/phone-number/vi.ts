import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const viPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Số điện thoại không hợp lệ",
	PHONE_NUMBER_EXIST: "Số điện thoại đã tồn tại",
	PHONE_NUMBER_NOT_EXIST: "Số điện thoại chưa được đăng ký",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Số điện thoại hoặc mật khẩu không hợp lệ",
	UNEXPECTED_ERROR: "Lỗi không mong muốn",
	OTP_NOT_FOUND: "Không tìm thấy OTP",
	OTP_EXPIRED: "OTP đã hết hạn",
	INVALID_OTP: "OTP không hợp lệ",
	PHONE_NUMBER_NOT_VERIFIED: "Số điện thoại chưa được xác minh",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "Không thể cập nhật số điện thoại",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP chưa được triển khai",
	TOO_MANY_ATTEMPTS: "Quá nhiều lần thử. Vui lòng thử lại sau.",
};
