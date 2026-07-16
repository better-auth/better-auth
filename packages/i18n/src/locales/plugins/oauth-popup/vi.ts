import type { OAUTH_POPUP_ERROR_CODES } from "better-auth/plugins";
import type { LocalizedTranslations } from "../../../types";

export const viOauthPopup: LocalizedTranslations<
	typeof OAUTH_POPUP_ERROR_CODES
> = {
	POPUP_SIGN_IN_FAILED: "Đăng nhập qua cửa sổ bật lên thất bại",
	POPUP_BLOCKED: "Cửa sổ bật lên đăng nhập bị trình duyệt chặn",
	POPUP_CLOSED: "Cửa sổ bật lên đăng nhập bị đóng trước khi hoàn thành",
	POPUP_TIMEOUT: "Cửa sổ bật lên đăng nhập đã hết thời gian chờ",
};
