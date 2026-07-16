import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const koAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "이메일이 유효한 형식으로 생성되지 않았습니다",
		FAILED_TO_CREATE_USER: "사용자 생성에 실패했습니다",
		COULD_NOT_CREATE_SESSION: "세션을 생성할 수 없습니다",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"익명 사용자는 다시 익명으로 로그인할 수 없습니다",
		FAILED_TO_DELETE_ANONYMOUS_USER: "익명 사용자 삭제에 실패했습니다",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"익명 사용자 세션 삭제에 실패했습니다",
		USER_IS_NOT_ANONYMOUS: "익명 사용자가 아닙니다",
		DELETE_ANONYMOUS_USER_DISABLED: "익명 사용자 삭제가 비활성화되었습니다",
	};
