import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const trAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "E-posta geçerli bir biçimde oluşturulmadı",
		FAILED_TO_CREATE_USER: "Kullanıcı oluşturulamadı",
		COULD_NOT_CREATE_SESSION: "Oturum oluşturulamadı",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Anonim kullanıcılar tekrar anonim olarak giriş yapamazlar",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Anonim kullanıcı silinemedi",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Anonim kullanıcı oturumları silinemedi",
		USER_IS_NOT_ANONYMOUS: "Kullanıcı anonim değil",
		DELETE_ANONYMOUS_USER_DISABLED:
			"Anonim kullanıcıların silinmesi devre dışı bırakıldı",
	};
