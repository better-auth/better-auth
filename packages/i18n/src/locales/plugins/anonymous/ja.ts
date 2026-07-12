import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const jaAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "メールアドレスが有効な形式で生成されませんでした",
		FAILED_TO_CREATE_USER: "ユーザーの作成に失敗しました",
		COULD_NOT_CREATE_SESSION: "セッションを作成できませんでした",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"匿名ユーザーは再度匿名でサインインすることはできません",
		FAILED_TO_DELETE_ANONYMOUS_USER: "匿名ユーザーの削除に失敗しました",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"匿名ユーザーのセッションの削除に失敗しました",
		USER_IS_NOT_ANONYMOUS: "ユーザーは匿名ではありません",
		DELETE_ANONYMOUS_USER_DISABLED: "匿名ユーザーの削除は無効になっています",
	};
