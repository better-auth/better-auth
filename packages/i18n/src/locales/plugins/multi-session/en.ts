import type { MULTI_SESSION_ERROR_CODES } from "better-auth/plugins/multi-session";
import type { LocalizedTranslations } from "../../../types";

export const enMultiSession: LocalizedTranslations<
	typeof MULTI_SESSION_ERROR_CODES
> = {
	INVALID_SESSION_TOKEN: "Invalid session token",
};
