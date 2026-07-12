import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const zhApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "元数据必须是对象或未定义",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"提供 refillInterval 时，refillAmount 是必填的",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"提供 refillAmount 时，refillInterval 是必填的",
	USER_BANNED: "用户已被封禁",
	UNAUTHORIZED_SESSION: "未授权或无效的会话",
	KEY_NOT_FOUND: "未找到 API 密钥",
	KEY_DISABLED: "API 密钥已被禁用",
	KEY_EXPIRED: "API 密钥已过期",
	USAGE_EXCEEDED: "API 密钥已达到其使用限制",
	KEY_NOT_RECOVERABLE: "API 密钥不可恢复",
	EXPIRES_IN_IS_TOO_SMALL: "expiresIn 值小于预设的最小值。",
	EXPIRES_IN_IS_TOO_LARGE: "expiresIn 值大于预设的最大值。",
	INVALID_REMAINING: "剩余次数太大或太小。",
	INVALID_PREFIX_LENGTH: "前缀长度太大或太小。",
	INVALID_NAME_LENGTH: "名称长度太大或太小。",
	METADATA_DISABLED: "元数据已被禁用。",
	RATE_LIMIT_EXCEEDED: "超出速率限制。",
	NO_VALUES_TO_UPDATE: "没有要更新的值。",
	KEY_DISABLED_EXPIRATION: "自定义密钥过期值已被禁用。",
	INVALID_API_KEY: "无效的 API 密钥。",
	INVALID_USER_ID_FROM_API_KEY: "API 密钥中的用户 ID 无效。",
	INVALID_REFERENCE_ID_FROM_API_KEY: "API 密钥中的引用 ID 无效。",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API 密钥获取器返回了无效的密钥类型。预期为字符串。",
	SERVER_ONLY_PROPERTY: "您尝试设置的属性只能从服务器身份验证实例进行设置。",
	FAILED_TO_UPDATE_API_KEY: "更新 API 密钥失败",
	NAME_REQUIRED: "API 密钥名称是必填的。",
	ORGANIZATION_ID_REQUIRED: "组织拥owned的 API 密钥需要组织 ID。",
	USER_NOT_MEMBER_OF_ORGANIZATION: "您不是拥有此 API 密钥的组织的成员。",
	INSUFFICIENT_API_KEY_PERMISSIONS: "您无权对组织 API 密钥执行此操作。",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND: "未找到默认 API 密钥配置。",
	ORGANIZATION_PLUGIN_REQUIRED:
		"组织拥有的 API 密钥需要组织插件。请安装并配置组织插件。",
};
