import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const koAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "사용자 생성에 실패했습니다",
	USER_ALREADY_EXISTS: "사용자가 이미 존재합니다.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"사용자가 이미 존재합니다. 다른 이메일을 사용하세요.",
	YOU_CANNOT_BAN_YOURSELF: "자신을 차단할 수 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"사용자 역할을 변경할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "사용자를 생성할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "사용자를 목록화할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"사용자 세션을 목록화할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "사용자를 차단할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "사용자를 가장할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"사용자 세션을 해제할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "사용자를 삭제할 권한이 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"사용자 비밀번호를 설정할 권한이 없습니다",
	BANNED_USER: "이 애플리케이션에서 차단되었습니다",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "사용자를 가져올 권한이 없습니다",
	NO_DATA_TO_UPDATE: "업데이트할 데이터가 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "사용자를 업데이트할 권한이 없습니다",
	YOU_CANNOT_REMOVE_YOURSELF: "자신을 삭제할 수 없습니다",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"존재하지 않는 역할 값을 설정할 권한이 없습니다",
	YOU_CANNOT_IMPERSONATE_ADMINS: "관리자를 가장할 수 없습니다",
	INVALID_ROLE_TYPE: "유효하지 않은 역할 유형",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"사용자 이메일을 업데이트할 권한이 없습니다",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"사용자 업데이트를 통해 비밀번호를 변경할 수 없습니다. 대신 set-user-password 엔드포인트를 사용하세요",
};
