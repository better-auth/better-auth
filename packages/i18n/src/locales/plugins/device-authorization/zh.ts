import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const zhDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "无效的设备代码",
	EXPIRED_DEVICE_CODE: "设备代码已过期",
	EXPIRED_USER_CODE: "用户代码已过期",
	AUTHORIZATION_PENDING: "授权等待中",
	ACCESS_DENIED: "拒绝访问",
	INVALID_USER_CODE: "无效的用户代码",
	DEVICE_CODE_ALREADY_PROCESSED: "设备代码已被处理",
	DEVICE_CODE_NOT_CLAIMED:
		"设备代码尚未被验证会话声明；在同意或拒绝前，请在登录状态下使用 `user_code` 调用 `GET /device`",
	POLLING_TOO_FREQUENTLY: "轮询过于频繁",
	USER_NOT_FOUND: "找不到该用户",
	FAILED_TO_CREATE_SESSION: "创建会话失败",
	INVALID_DEVICE_CODE_STATUS: "无效的设备代码状态",
	AUTHENTICATION_REQUIRED: "需要进行身份验证",
};
