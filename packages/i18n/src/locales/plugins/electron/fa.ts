import type { ELECTRON_ERROR_CODES } from "@better-auth/electron";
import type { LocalizedTranslations } from "../../../types";

export const faElectron: LocalizedTranslations<typeof ELECTRON_ERROR_CODES> = {
	INVALID_CLIENT_ID: "شناسه کلاینت نامعتبر است",
	INVALID_TOKEN: "توکن نامعتبر یا منقضی شده است.",
	STATE_MISMATCH: "عدم تطابق وضعیت (state)",
	MISSING_CODE_CHALLENGE: "چالش کد (code challenge) وجود ندارد",
	INVALID_CODE_VERIFIER: "تایید کننده کد (code verifier) نامعتبر است",
	MISSING_STATE: "وضعیت (state) الزامی است",
	MISSING_PKCE: "PKCE الزامی است",
};
