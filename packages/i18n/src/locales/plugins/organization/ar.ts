import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const arOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"غير مسموح لك بإنشاء منظمة جديدة",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"لقد وصلت إلى الحد الأقصى للمنظمات",
	ORGANIZATION_ALREADY_EXISTS: "المنظمة موجودة بالفعل",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "المعرف الفريد للمنظمة مستخدم بالفعل",
	ORGANIZATION_NOT_FOUND: "المنظمة غير موجودة",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "المستخدم ليس عضوًا في المنظمة",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"غير مسموح لك بتحديث هذه المنظمة",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"غير مسموح لك بحذف هذه المنظمة",
	NO_ACTIVE_ORGANIZATION: "لا توجد منظمة نشطة",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"المستخدم عضو بالفعل في هذه المنظمة",
	MEMBER_NOT_FOUND: "العضو غير موجود",
	ROLE_NOT_FOUND: "الدور غير موجود",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "غير مسموح لك بإنشاء فريق جديد",
	TEAM_ALREADY_EXISTS: "الفريق موجود بالفعل",
	TEAM_NOT_FOUND: "الفريق غير موجود",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"لا يمكنك مغادرة المنظمة لأنك المالك الوحيد",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"لا يمكنك مغادرة المنظمة بدون تعيين مالك",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "غير مسموح لك بحذف هذا العضو",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"غير مسموح لك بدعوة مستخدمين لهذه المنظمة",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"المستخدم مدعو بالفعل لهذه المنظمة",
	INVITATION_NOT_FOUND: "الدعوة غير موجودة",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "أنت لست مستلم هذه الدعوة",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"مطلوب تأكيد البريد الإلكتروني قبل قبول أو رفض الدعوة",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"مطلوب تأكيد البريد الإلكتروني لعرض الدعوات",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"غير مسموح لك بإلغاء هذه الدعوة",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"الداعي لم يعد عضوًا في المنظمة",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"غير مسموح لك بدعوة مستخدم بهذا الدور",
	FAILED_TO_RETRIEVE_INVITATION: "فشل في استرداد الدعوة",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"لقد وصلت إلى الحد الأقصى للفرق",
	UNABLE_TO_REMOVE_LAST_TEAM: "تعذر حذف الفريق الأخير",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "غير مسموح لك بتحديث هذا العضو",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"تم الوصول إلى الحد الأقصى لأعضاء المنظمة",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"غير مسموح لك بإنشاء فرق في هذه المنظمة",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"غير مسموح لك بحذف فرق في هذه المنظمة",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "غير مسموح لك بتحديث هذا الفريق",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "غير مسموح لك بحذف هذا الفريق",
	INVITATION_LIMIT_REACHED: "تم الوصول إلى حد الدعوات الأقصى",
	TEAM_MEMBER_LIMIT_REACHED: "تم الوصول إلى حد أعضاء الفريق الأقصى",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "المستخدم ليس عضوًا في الفريق",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"غير مسموح لك بعرض أعضاء هذا الفريق",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "ليس لديك فريق نشط",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"غير مسموح لك بإنشاء عضو جديد في الفريق",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"غير مسموح لك بإزالة عضو من الفريق",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"غير مسموح لك بالوصول إلى هذه المنظمة كمالك",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "أنت لست عضوًا في هذه المنظمة",
	MISSING_AC_INSTANCE:
		"التحكم بالوصول الديناميكي يتطلب وجود مثيل AC محدد مسبقًا على الخادم",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"يجب أن تكون في منظمة لإنشاء دور",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "غير مسموح لك بإنشاء دور",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "غير مسموح لك بتحديث دور",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "غير مسموح لك بحذف دور",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "غير مسموح لك بقراءة دور",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "غير مسموح لك بعرض قائمة الأدوار",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "غير مسموح لك بالحصول على دور",
	TOO_MANY_ROLES: "هذه المنظمة لديها العديد من الأدوار",
	INVALID_RESOURCE: "الإذن المقدم يتضمن موردًا غير صالح",
	ROLE_NAME_IS_ALREADY_TAKEN: "اسم الدور هذا مستخدم بالفعل",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "لا يمكن حذف دور محدد مسبقًا",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"لا يمكن حذف دور مخصص للأعضاء. يرجى إعادة تعيين الأعضاء أولاً",
	INVALID_TEAM_ID: "يحتوي معرف الفريق على رمز محجوز",
};
