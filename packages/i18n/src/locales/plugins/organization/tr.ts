import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const trOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Yeni bir organizasyon oluşturmanıza izin verilmiyor",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Maksimum organizasyon sayısına ulaştınız",
	ORGANIZATION_ALREADY_EXISTS: "Organizasyon zaten mevcut",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Organizasyon kısa adı zaten alınmış",
	ORGANIZATION_NOT_FOUND: "Organizasyon bulunamadı",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"Kullanıcı organizasyonun üyesi değil",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Bu organizasyonu güncellemenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Bu organizasyonu silmenize izin verilmiyor",
	NO_ACTIVE_ORGANIZATION: "Aktif organizasyon yok",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Kullanıcı zaten bu organizasyonun üyesi",
	MEMBER_NOT_FOUND: "Üye bulunamadı",
	ROLE_NOT_FOUND: "Rol bulunamadı",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"Yeni bir takım oluşturmanıza izin verilmiyor",
	TEAM_ALREADY_EXISTS: "Takım zaten mevcut",
	TEAM_NOT_FOUND: "Takım bulunamadı",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Tek sahip olarak organizasyondan ayrılamazsınız",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Bir sahip olmadan organizasyondan ayrılamazsınız",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Bu üyeyi silmenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Bu organizasyona kullanıcı davet etmenize izin verilmiyor",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Kullanıcı zaten bu organizasyona davet edilmiş",
	INVITATION_NOT_FOUND: "Davet bulunamadı",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "Davetin alıcısı siz değilsiniz",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Daveti kabul etmeden veya reddetmeden önce e-posta doğrulaması gereklidir",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Davetleri görüntülemek için e-posta doğrulaması gereklidir",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Bu daveti iptal etmenize izin verilmiyor",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Davet eden artık organizasyonun üyesi değil",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Bu role sahip bir kullanıcı davet etmenize izin verilmiyor",
	FAILED_TO_RETRIEVE_INVITATION: "Davet alınamadı",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Maksimum takım sayısına ulaştınız",
	UNABLE_TO_REMOVE_LAST_TEAM: "Son takım silinemez",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Bu üyeyi güncellemenize izin verilmiyor",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Organizasyon üyelik sınırına ulaşıldı",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Bu organizasyonda takım oluşturmanıza izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Bu organizasyonda takım silmenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Bu takımı güncellemenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"Bu takımı silmenize izin verilmiyor",
	INVITATION_LIMIT_REACHED: "Davet sınırına ulaşıldı",
	TEAM_MEMBER_LIMIT_REACHED: "Takım üye sınırına ulaşıldı",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Kullanıcı takımın üyesi değil",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Bu takımın üyelerini listelemenize izin verilmiyor",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Aktif bir takımınız yok",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Yeni bir üye oluşturmanıza izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Takım üyesini silmenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Sahip olarak bu organizasyona erişmenize izin verilmiyor",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Bu organizasyonun üyesi değilsiniz",
	MISSING_AC_INSTANCE:
		"Dinamik Erişim Kontrolü, sunucuda önceden tanımlanmış bir ac örneği gerektirir",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Bir rol oluşturmak için bir organizasyonda olmalısınız",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "Bir rol oluşturmanıza izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"Bir rolü güncellemenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "Bir rolü silmenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "Bir rolü okumanıza izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "Rolleri listelemenize izin verilmiyor",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "Bir rolü almanıza izin verilmiyor",
	TOO_MANY_ROLES: "Bu organizasyonda çok fazla rol var",
	INVALID_RESOURCE: "Verilen izin geçersiz bir kaynak içeriyor",
	ROLE_NAME_IS_ALREADY_TAKEN: "Bu rol adı zaten alınmış",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Önceden tanımlanmış bir rol silinemez",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Üyelere atanmış bir rol silinemez. Lütfen önce üyeleri farklı bir role atayın",
	INVALID_TEAM_ID: "Takım kimliği ayrılmış bir karakter içeriyor",
};
