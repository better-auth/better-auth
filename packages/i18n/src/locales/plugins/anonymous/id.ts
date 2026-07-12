import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const idAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "Email tidak dibuat dalam format yang valid",
		FAILED_TO_CREATE_USER: "Gagal membuat pengguna",
		COULD_NOT_CREATE_SESSION: "Tidak dapat membuat sesi",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Pengguna anonim tidak dapat masuk secara anonim lagi",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Gagal menghapus pengguna anonim",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Gagal menghapus sesi pengguna anonim",
		USER_IS_NOT_ANONYMOUS: "Pengguna bukan anonim",
		DELETE_ANONYMOUS_USER_DISABLED: "Penghapusan pengguna anonim dinonaktifkan",
	};
