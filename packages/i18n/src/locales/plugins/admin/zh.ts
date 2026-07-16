import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const zhAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "创建用户失败",
	USER_ALREADY_EXISTS: "用户已存在。",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "用户已存在。请使用其他电子邮箱。",
	YOU_CANNOT_BAN_YOURSELF: "你不能封禁你自己",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "你无权更改用户角色",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "你无权创建用户",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "你无权列出用户",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: "你无权列出用户会话",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "你无权封禁用户",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "你无权模拟用户",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: "你无权撤销用户会话",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "你无权删除用户",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "你无权设置用户密码",
	BANNED_USER: "你已被该应用程序封禁",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "你无权获取用户",
	NO_DATA_TO_UPDATE: "没有数据需要更新",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "你无权更新用户",
	YOU_CANNOT_REMOVE_YOURSELF: "你 cannot remove yourself",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: "你无权设置不存在的角色值",
	YOU_CANNOT_IMPERSONATE_ADMINS: "你不能模拟管理员",
	INVALID_ROLE_TYPE: "无效的角色类型",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: "你无权更新用户邮箱",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"密码不能通过更新用户接口来修改。请改用 set-user-password 接口",
};
