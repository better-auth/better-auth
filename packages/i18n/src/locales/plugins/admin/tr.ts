import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const trAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Kullanıcı oluşturulamadı",
	USER_ALREADY_EXISTS: "Kullanıcı zaten mevcut.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"Kullanıcı zaten mevcut. Başka bir e-posta kullanın.",
	YOU_CANNOT_BAN_YOURSELF: "Kendinizi engelleyemezsiniz",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Kullanıcıların rolünü değiştirmeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Kullanıcı oluşturmaya yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "Kullanıcıları listelemeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Kullanıcı oturumlarını listelemeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Kullanıcıları engellemeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Kullanıcıların kimliğine bürünmeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Kullanıcı oturumlarını iptal etmeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "Kullanıcıları silmeye yetkiniz yok",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Kullanıcıların şifresini belirlemeye yetkiniz yok",
	BANNED_USER: "Bu uygulamadan engellendiniz",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "Kullanıcıyı getirmeye yetkiniz yok",
	NO_DATA_TO_UPDATE: "Güncellenecek veri yok",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Kullanıcıları güncellemeye yetkiniz yok",
	YOU_CANNOT_REMOVE_YOURSELF: "Kendinizi kaldıramazsınız",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Mevcut olmayan bir rol değerini belirlemeye yetkiniz yok",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Yöneticilerin kimliğine bürünemezsiniz",
	INVALID_ROLE_TYPE: "Geçersiz rol türü",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Kullanıcıların e-postasını güncellemeye yetkiniz yok",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"Şifre, kullanıcı güncelleme yoluyla güncellenemez. Bunun yerine set-user-password uç noktasını kullanın",
};
