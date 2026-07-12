import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const zhPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "手机号码无效",
	PHONE_NUMBER_EXIST: "该手机号码已存在",
	PHONE_NUMBER_NOT_EXIST: "该手机号码未注册",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "手机号码或密码无效",
	UNEXPECTED_ERROR: "发生意外错误",
	OTP_NOT_FOUND: "未找到验证码",
	OTP_EXPIRED: "验证码已过期",
	INVALID_OTP: "验证码无效",
	PHONE_NUMBER_NOT_VERIFIED: "手机号码未验证",
	PHONE_NUMBER_CANNOT_BE_UPDATED: "手机号码无法更新",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP 未实现",
	TOO_MANY_ATTEMPTS: "尝试次数过多，请稍后再试。",
};
