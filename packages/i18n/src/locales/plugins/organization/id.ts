import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const idOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Anda tidak diizinkan membuat organisasi baru",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Anda telah mencapai jumlah maksimum organisasi",
	ORGANIZATION_ALREADY_EXISTS: "Organisasi sudah ada",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Slug organisasi sudah digunakan",
	ORGANIZATION_NOT_FOUND: "Organisasi tidak ditemukan",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "Pengguna bukan anggota organisasi",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Anda tidak diizinkan memperbarui organisasi ini",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Anda tidak diizinkan menghapus organisasi ini",
	NO_ACTIVE_ORGANIZATION: "Tidak ada organisasi aktif",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Pengguna sudah menjadi anggota organisasi ini",
	MEMBER_NOT_FOUND: "Anggota tidak ditemukan",
	ROLE_NOT_FOUND: "Peran tidak ditemukan",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"Anda tidak diizinkan membuat tim baru",
	TEAM_ALREADY_EXISTS: "Tim sudah ada",
	TEAM_NOT_FOUND: "Tim tidak ditemukan",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Anda tidak dapat meninggalkan organisasi sebagai satu-satunya pemilik",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Anda tidak dapat meninggalkan organisasi tanpa pemilik",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Anda tidak diizinkan menghapus anggota ini",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Anda tidak diizinkan mengundang pengguna ke organisasi ini",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Pengguna sudah diundang ke organisasi ini",
	INVITATION_NOT_FOUND: "Undangan tidak ditemukan",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "Anda bukan penerima undangan",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Verifikasi email diperlukan sebelum menerima atau menolak undangan",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Verifikasi email diperlukan untuk melihat undangan",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Anda tidak diizinkan membatalkan undangan ini",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Pengundang bukan lagi anggota organisasi",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Anda tidak diizinkan mengundang pengguna dengan peran ini",
	FAILED_TO_RETRIEVE_INVITATION: "Gagal mengambil undangan",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Anda telah mencapai jumlah maksimum tim",
	UNABLE_TO_REMOVE_LAST_TEAM: "Tidak dapat menghapus tim terakhir",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Anda tidak diizinkan memperbarui anggota ini",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Batas keanggotaan organisasi tercapai",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Anda tidak diizinkan membuat tim di organisasi ini",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Anda tidak diizinkan menghapus tim di organisasi ini",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Anda tidak diizinkan memperbarui tim ini",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"Anda tidak diizinkan menghapus tim ini",
	INVITATION_LIMIT_REACHED: "Batas undangan tercapai",
	TEAM_MEMBER_LIMIT_REACHED: "Batas anggota tim tercapai",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Pengguna bukan anggota tim",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Anda tidak diizinkan melihat daftar anggota tim ini",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Anda tidak memiliki tim aktif",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Anda tidak diizinkan membuat anggota baru",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Anda tidak diizinkan menghapus anggota tim",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Anda tidak diizinkan mengakses organisasi ini sebagai pemilik",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Anda bukan anggota organisasi ini",
	MISSING_AC_INSTANCE:
		"Kontrol Akses Dinamis memerlukan instansi ac yang ditentukan sebelumnya di server",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Anda harus berada di organisasi untuk membuat peran",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "Anda tidak diizinkan membuat peran",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"Anda tidak diizinkan memperbarui peran",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "Anda tidak diizinkan menghapus peran",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "Anda tidak diizinkan membaca peran",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "Anda tidak diizinkan mencantumkan peran",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "Anda tidak diizinkan mendapatkan peran",
	TOO_MANY_ROLES: "Organisasi ini memiliki terlalu banyak peran",
	INVALID_RESOURCE: "Izin yang diberikan mencakup sumber daya yang tidak valid",
	ROLE_NAME_IS_ALREADY_TAKEN: "Nama peran tersebut sudah digunakan",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE:
		"Tidak dapat menghapus peran yang telah ditentukan sebelumnya",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Tidak dapat menghapus peran yang ditetapkan untuk anggota. Silakan tetapkan anggota ke peran lain terlebih dahulu",
	INVALID_TEAM_ID: "ID tim berisi karakter yang dicadangkan",
};
