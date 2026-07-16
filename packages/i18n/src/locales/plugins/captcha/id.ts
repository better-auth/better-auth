import type { captcha } from "better-auth/plugins";

type CaptchaErrorCodes = ReturnType<typeof captcha>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const idCaptcha: LocalizedTranslations<CaptchaErrorCodes> = {
	VERIFICATION_FAILED: "Verifikasi captcha gagal",
	MISSING_RESPONSE: "Respons CAPTCHA tidak ada",
	UNKNOWN_ERROR: "Terjadi kesalahan",
};
