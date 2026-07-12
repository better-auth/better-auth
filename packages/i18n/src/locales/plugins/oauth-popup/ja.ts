import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const jaOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "ポップアップでのサインインに失敗しました",
	POPUP_BLOCKED: "サインインポップアップがブラウザによってブロックされました",
	POPUP_CLOSED: "サインインポップアップが完了前に閉じられました",
	POPUP_TIMEOUT: "サインインポップアップがタイムアウトしました",
};
