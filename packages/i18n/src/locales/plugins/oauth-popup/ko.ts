import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const koOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "팝업 로그인에 실패했습니다",
	POPUP_BLOCKED: "로그인 팝업이 브라우저에 의해 차단되었습니다",
	POPUP_CLOSED: "로그인 팝업이 완료되기 전에 닫혔습니다",
	POPUP_TIMEOUT: "로그인 팝업 시간이 초과되었습니다",
};
