import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { PluginErrorTranslations } from "../../types";

export const organizationTranslations: PluginErrorTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	ar: {
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
	},
	bn: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"আপনাকে একটি নতুন সংস্থা তৈরি করার অনুমতি দেওয়া হয়নি",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"আপনি সংস্থার সর্বাধিক সংখ্যায় পৌঁছেছেন",
		ORGANIZATION_ALREADY_EXISTS: "সংস্থা ইতিমধ্যে বিদ্যমান",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "সংস্থার স্ল্যাগ ইতিমধ্যে নেওয়া হয়েছে",
		ORGANIZATION_NOT_FOUND: "সংস্থা পাওয়া যায়নি",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "ব্যবহারকারী সংস্থার সদস্য নন",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"আপনাকে এই সংস্থা আপডেট করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"আপনাকে এই সংস্থাটি মুছে ফেলার অনুমতি দেওয়া হয়নি",
		NO_ACTIVE_ORGANIZATION: "কোনো সক্রিয় সংস্থা নেই",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"ব্যবহারকারী ইতিমধ্যে এই সংস্থার সদস্য",
		MEMBER_NOT_FOUND: "সদস্য পাওয়া যায়নি",
		ROLE_NOT_FOUND: "ভূমিকা পাওয়া যায়নি",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"আপনাকে একটি নতুন দল তৈরি করার অনুমতি দেওয়া হয়নি",
		TEAM_ALREADY_EXISTS: "দল ইতিমধ্যে বিদ্যমান",
		TEAM_NOT_FOUND: "দল পাওয়া যায়নি",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"আপনি একমাত্র মালিক হিসাবে সংস্থাটি ছেড়ে যেতে পারবেন না",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"আপনি একজন মালিক ছাড়া সংস্থাটি ছেড়ে যেতে পারবেন না",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"আপনাকে এই সদস্যকে মুছে ফেলার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"আপনাকে এই সংস্থায় ব্যবহারকারীদের আমন্ত্রণ জানানোর অনুমতি দেওয়া হয়নি",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"ব্যবহারকারী ইতিমধ্যে এই সংস্থায় আমন্ত্রিত",
		INVITATION_NOT_FOUND: "আমন্ত্রণ পাওয়া যায়নি",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "আপনি আমন্ত্রণের প্রাপক নন",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"আমন্ত্রণ গ্রহণ বা প্রত্যাখ্যান করার আগে ইমেল যাচাইকরণ প্রয়োজন",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"সেশন ইমেলের জন্য আমন্ত্রণগুলি দেখতে বা তালিকাভুক্ত করতে ইমেল যাচাইকরণ প্রয়োজন",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"আপনাকে এই আমন্ত্রণ বাতিল করার অনুমতি দেওয়া হয়নি",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"আমন্ত্রণকারী আর সংস্থার সদস্য নন",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"আপনাকে এই ভূমিকা সহ ব্যবহারকারীকে আমন্ত্রণ জানানোর অনুমতি দেওয়া হয়নি",
		FAILED_TO_RETRIEVE_INVITATION: "আমন্ত্রণ পুনরুদ্ধার করতে ব্যর্থ",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"আপনি দলের সর্বাধিক সংখ্যায় পৌঁছেছেন",
		UNABLE_TO_REMOVE_LAST_TEAM: "শেষ দলটি সরাতে অক্ষম",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"আপনাকে এই সদস্যকে আপডেট করার অনুমতি দেওয়া হয়নি",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "সংস্থার সদস্যতার সীমায় পৌঁছে গেছেন",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"আপনাকে এই সংস্থায় দল তৈরি করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"আপনাকে এই সংস্থায় দল মুছে ফেলার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"আপনাকে এই দল আপডেট করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"আপনাকে এই দল মুছে ফেলার অনুমতি দেওয়া হয়নি",
		INVITATION_LIMIT_REACHED: "আমন্ত্রণের সীমায় পৌঁছে গেছেন",
		TEAM_MEMBER_LIMIT_REACHED: "দলের সদস্য সংখ্যার সীমায় পৌঁছে গেছেন",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "ব্যবহারকারী দলের সদস্য নন",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"আপনাকে এই দলের সদস্যদের তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "আপনার কোনো সক্রিয় দল নেই",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"আপনাকে একজন নতুন সদস্য তৈরি করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"আপনাকে দলের সদস্য সরাতে অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"মালিক হিসাবে আপনার এই সংস্থায় অ্যাক্সেস করার অনুমতি নেই",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "আপনি এই সংস্থার সদস্য নন",
		MISSING_AC_INSTANCE:
			"ডায়নামিক অ্যাক্সেস কন্ট্রোলের জন্য সার্ভার প্লাগইনে একটি পূর্ব-সংজ্ঞায়িত ac ইনস্ট্যান্স প্রয়োজন",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"একটি ভূমিকা তৈরি করতে আপনাকে একটি সংস্থায় থাকতে হবে",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "আপনাকে ভূমিকা তৈরি করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"আপনাকে ভূমিকা আপডেট করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "আপনাকে ভূমিকা মুছে ফেলার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "আপনাকে ভূমিকা পড়ার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"আপনাকে ভূমিকা তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "আপনাকে ভূমিকা পাওয়ার অনুমতি দেওয়া হয়নি",
		TOO_MANY_ROLES: "এই সংস্থায় খুব বেশি ভূমিকা রয়েছে",
		INVALID_RESOURCE: "প্রদত্ত অনুমতিতে একটি অবৈধ সংস্থান অন্তর্ভুক্ত রয়েছে",
		ROLE_NAME_IS_ALREADY_TAKEN: "সেই ভূমিকার নামটি ইতিমধ্যে নেওয়া হয়েছে",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "একটি পূর্ব-সংজ্ঞায়িত ভূমিকা মুছে ফেলা যাবে না",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"সদস্যদের অর্পিত ভূমিকা মুছে ফেলা যাবে না। অনুগ্রহ করে প্রথমে সদস্যদের অন্য ভূমিকা দিন",
		INVALID_TEAM_ID: "দল আইডিতে একটি সংরক্ষিত অক্ষর রয়েছে",
	},
	de: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Sie sind nicht berechtigt, eine neue Organisation zu erstellen",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Sie haben die maximale Anzahl von Organisationen erreicht",
		ORGANIZATION_ALREADY_EXISTS: "Organisation existiert bereits",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Organisations-Slug ist bereits vergeben",
		ORGANIZATION_NOT_FOUND: "Organisation nicht gefunden",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Benutzer ist kein Mitglied der Organisation",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Sie sind nicht berechtigt, diese Organisation zu aktualisieren",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Sie sind nicht berechtigt, diese Organisation zu löschen",
		NO_ACTIVE_ORGANIZATION: "Keine aktive Organisation",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Benutzer ist bereits Mitglied dieser Organisation",
		MEMBER_NOT_FOUND: "Mitglied nicht gefunden",
		ROLE_NOT_FOUND: "Rolle nicht gefunden",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Sie sind nicht berechtigt, ein neues Team zu erstellen",
		TEAM_ALREADY_EXISTS: "Team existiert bereits",
		TEAM_NOT_FOUND: "Team nicht gefunden",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Sie können die Organisation nicht als einziger Eigentümer verlassen",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Sie können die Organisation nicht ohne einen Eigentümer verlassen",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Sie sind nicht berechtigt, dieses Mitglied zu löschen",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Sie sind nicht berechtigt, Benutzer zu dieser Organisation einzuladen",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Benutzer ist bereits zu dieser Organisation eingeladen",
		INVITATION_NOT_FOUND: "Einladung nicht gefunden",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Sie sind nicht der Empfänger der Einladung",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"E-Mail-Verifizierung erforderlich, bevor die Einladung angenommen oder abgelehnt werden kann",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"E-Mail-Verifizierung erforderlich, um Einladungen für die Sitzungs-E-Mail anzuzeigen",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Sie sind nicht berechtigt, diese Einladung zu stornieren",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Der Einladende ist kein Mitglied der Organisation mehr",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Sie sind nicht berechtigt, einen Benutzer mit dieser Rolle einzuladen",
		FAILED_TO_RETRIEVE_INVITATION: "Einladung konnte nicht abgerufen werden",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Sie haben die maximale Anzahl von Teams erreicht",
		UNABLE_TO_REMOVE_LAST_TEAM: "Das letzte Team kann nicht entfernt werden",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Sie sind nicht berechtigt, dieses Mitglied zu aktualisieren",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Limit für Organisationsmitglieder erreicht",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Sie sind nicht berechtigt, Teams in dieser Organisation zu erstellen",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Sie sind nicht berechtigt, Teams in dieser Organisation zu löschen",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Sie sind nicht berechtigt, dieses Team zu aktualisieren",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Sie sind nicht berechtigt, dieses Team zu löschen",
		INVITATION_LIMIT_REACHED: "Einladungslimit erreicht",
		TEAM_MEMBER_LIMIT_REACHED: "Limit für Teammitglieder erreicht",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Benutzer ist kein Mitglied des Teams",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Sie sind nicht berechtigt, die Mitglieder dieses Teams aufzulisten",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Sie haben kein aktives Team",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Sie sind nicht berechtigt, ein neues Mitglied zu erstellen",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Sie sind nicht berechtigt, ein Teammitglied zu entfernen",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Sie sind nicht berechtigt, auf diese Organisation als Eigentümer zuzugreifen",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Sie sind kein Mitglied dieser Organisation",
		MISSING_AC_INSTANCE:
			"Dynamische Zugriffskontrolle erfordert eine vordefinierte ac-Instanz auf dem Server-Auth-Plugin",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Sie müssen sich in einer Organisation befinden, um eine Rolle zu erstellen",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Sie sind nicht berechtigt, eine Rolle zu erstellen",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Sie sind nicht berechtigt, eine Rolle zu aktualisieren",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Sie sind nicht berechtigt, eine Rolle zu löschen",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Sie sind nicht berechtigt, eine Rolle zu lesen",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Sie sind nicht berechtigt, eine Rolle aufzulisten",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Sie sind nicht berechtigt, eine Rolle abzurufen",
		TOO_MANY_ROLES: "Diese Organisation hat zu viele Rollen",
		INVALID_RESOURCE:
			"Die angegebene Berechtigung enthält eine ungültige Ressource",
		ROLE_NAME_IS_ALREADY_TAKEN: "Dieser Rollenname ist bereits vergeben",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Eine vordefinierte Rolle kann nicht gelöscht werden",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Eine Rolle, die Mitgliedern zugewiesen ist, kann nicht gelöscht werden. Bitte weisen Sie die Mitglieder zuerst einer anderen Rolle zu",
		INVALID_TEAM_ID: "Die Team-ID enthält ein reserviertes Zeichen",
	},
	en: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"You are not allowed to create a new organization",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"You have reached the maximum number of organizations",
		ORGANIZATION_ALREADY_EXISTS: "Organization already exists",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Organization slug already taken",
		ORGANIZATION_NOT_FOUND: "Organization not found",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"User is not a member of the organization",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"You are not allowed to update this organization",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"You are not allowed to delete this organization",
		NO_ACTIVE_ORGANIZATION: "No active organization",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"User is already a member of this organization",
		MEMBER_NOT_FOUND: "Member not found",
		ROLE_NOT_FOUND: "Role not found",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"You are not allowed to create a new team",
		TEAM_ALREADY_EXISTS: "Team already exists",
		TEAM_NOT_FOUND: "Team not found",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"You cannot leave the organization as the only owner",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"You cannot leave the organization without an owner",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"You are not allowed to delete this member",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"You are not allowed to invite users to this organization",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"User is already invited to this organization",
		INVITATION_NOT_FOUND: "Invitation not found",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"You are not the recipient of the invitation",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Email verification required before accepting or rejecting invitation",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Email verification required to view or list invitations for the session email",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"You are not allowed to cancel this invitation",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Inviter is no longer a member of the organization",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"You are not allowed to invite a user with this role",
		FAILED_TO_RETRIEVE_INVITATION: "Failed to retrieve invitation",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"You have reached the maximum number of teams",
		UNABLE_TO_REMOVE_LAST_TEAM: "Unable to remove last team",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"You are not allowed to update this member",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Organization membership limit reached",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"You are not allowed to create teams in this organization",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"You are not allowed to delete teams in this organization",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"You are not allowed to update this team",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"You are not allowed to delete this team",
		INVITATION_LIMIT_REACHED: "Invitation limit reached",
		TEAM_MEMBER_LIMIT_REACHED: "Team member limit reached",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "User is not a member of the team",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"You are not allowed to list the members of this team",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "You do not have an active team",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"You are not allowed to create a new member",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"You are not allowed to remove a team member",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"You are not allowed to access this organization as an owner",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"You are not a member of this organization",
		MISSING_AC_INSTANCE:
			"Dynamic Access Control requires a pre-defined ac instance on the server auth plugin. Read server logs for more information",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"You must be in an organization to create a role",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"You are not allowed to create a role",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"You are not allowed to update a role",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"You are not allowed to delete a role",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "You are not allowed to read a role",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "You are not allowed to list a role",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "You are not allowed to get a role",
		TOO_MANY_ROLES: "This organization has too many roles",
		INVALID_RESOURCE: "The provided permission includes an invalid resource",
		ROLE_NAME_IS_ALREADY_TAKEN: "That role name is already taken",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Cannot delete a pre-defined role",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Cannot delete a role that is assigned to members. Please reassign the members to a different role first",
		INVALID_TEAM_ID: "Team id contains a reserved character",
	},
	es: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"No tienes permitido crear una nueva organización",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Has alcanzado el número máximo de organizaciones",
		ORGANIZATION_ALREADY_EXISTS: "La organización ya existe",
		ORGANIZATION_SLUG_ALREADY_TAKEN:
			"El slug de la organización ya está en uso",
		ORGANIZATION_NOT_FOUND: "Organización no encontrada",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"El usuario no es miembro de la organización",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"No tienes permitido actualizar esta organización",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"No tienes permitido eliminar esta organización",
		NO_ACTIVE_ORGANIZATION: "No hay organización activa",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"El usuario ya es miembro de esta organización",
		MEMBER_NOT_FOUND: "Miembro no encontrado",
		ROLE_NOT_FOUND: "Rol no encontrado",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"No tienes permitido crear un nuevo equipo",
		TEAM_ALREADY_EXISTS: "El equipo ya existe",
		TEAM_NOT_FOUND: "Equipo no encontrado",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"No puedes dejar la organización como el único propietario",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"No puedes dejar la organización sin un propietario",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"No tienes permitido eliminar a este miembro",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"No tienes permitido invitar usuarios a esta organización",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"El usuario ya está invitado a esta organización",
		INVITATION_NOT_FOUND: "Invitación no encontrada",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"No eres el destinatario de la invitación",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Se requiere verificación de correo electrónico antes de aceptar o rechazar la invitación",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Se requiere verificación de correo electrónico para ver invitaciones",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"No tienes permitido cancelar esta invitación",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"El invitador ya no es miembro de la organización",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"No tienes permitido invitar a un usuario con este rol",
		FAILED_TO_RETRIEVE_INVITATION: "Error al recuperar la invitación",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Has alcanzado el número máximo de equipos",
		UNABLE_TO_REMOVE_LAST_TEAM: "No se puede eliminar el último equipo",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"No tienes permitido actualizar a este miembro",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Límite de miembros de la organización alcanzado",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"No tienes permitido crear equipos en esta organización",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"No tienes permitido eliminar equipos en esta organización",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"No tienes permitido actualizar este equipo",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"No tienes permitido eliminar este equipo",
		INVITATION_LIMIT_REACHED: "Límite de invitaciones alcanzado",
		TEAM_MEMBER_LIMIT_REACHED: "Límite de miembros del equipo alcanzado",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "El usuario no es miembro del equipo",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"No tienes permitido listar los miembros de este equipo",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "No tienes un equipo activo",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"No tienes permitido crear un nuevo miembro",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"No tienes permitido eliminar un miembro del equipo",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"No tienes permitido acceder a esta organización como propietario",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"No eres miembro de esta organización",
		MISSING_AC_INSTANCE:
			"El Control de Acceso Dinámico requiere una instancia ac predefinida en el plugin del servidor",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Debes estar en una organización para crear un rol",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "No tienes permitido crear un rol",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"No tienes permitido actualizar un rol",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "No tienes permitido eliminar un rol",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "No tienes permitido leer un rol",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "No tienes permitido listar un rol",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "No tienes permitido obtener un rol",
		TOO_MANY_ROLES: "Esta organización tiene demasiados roles",
		INVALID_RESOURCE: "El permiso proporcionado incluye un recurso inválido",
		ROLE_NAME_IS_ALREADY_TAKEN: "Ese nombre de rol ya está en uso",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "No se puede eliminar un rol predefinido",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"No se puede eliminar un rol asignado a miembros. Por favor, reasigna a los miembros a un rol diferente primero",
		INVALID_TEAM_ID: "El ID del equipo contiene un carácter reservado",
	},
	fa: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"شما مجاز به ایجاد سازمان جدید نیستید",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"شما به حداکثر تعداد سازمان‌ها رسیده‌اید",
		ORGANIZATION_ALREADY_EXISTS: "سازمان از قبل وجود دارد",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "نام مستعار سازمان از قبل گرفته شده است",
		ORGANIZATION_NOT_FOUND: "سازمان یافت نشد",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "کاربر عضو سازمان نیست",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"شما مجاز به به‌روزرسانی این سازمان نیستید",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"شما مجاز به حذف این سازمان نیستید",
		NO_ACTIVE_ORGANIZATION: "سازمان فعالی وجود ندارد",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"کاربر از قبل عضو این سازمان است",
		MEMBER_NOT_FOUND: "عضو یافت نشد",
		ROLE_NOT_FOUND: "نقش یافت نشد",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"شما مجاز به ایجاد تیم جدید نیستید",
		TEAM_ALREADY_EXISTS: "تیم از قبل وجود دارد",
		TEAM_NOT_FOUND: "تیم یافت نشد",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"شما نمی‌توانید سازمان را به عنوان تنها مالک ترک کنید",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"شما نمی‌توانید سازمان را بدون مالک ترک کنید",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "شما مجاز به حذف این عضو نیستید",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"شما مجاز به دعوت کاربران به این سازمان نیستید",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"کاربر از قبل به این سازمان دعوت شده است",
		INVITATION_NOT_FOUND: "دعوت‌نامه یافت نشد",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"شما دریافت‌کننده این دعوت‌نامه نیستید",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"تأیید ایمیل قبل از پذیرش یا رد دعوت‌نامه الزامی است",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"تأیید ایمیل برای مشاهده دعوت‌نامه‌ها الزامی است",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"شما مجاز به لغو این دعوت‌نامه نیستید",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"دعوت‌کننده دیگر عضو سازمان نیست",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"شما مجاز به دعوت کاربر با این نقش نیستید",
		FAILED_TO_RETRIEVE_INVITATION: "خطا در بازیابی دعوت‌نامه",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"شما به حداکثر تعداد تیم‌ها رسیده‌اید",
		UNABLE_TO_REMOVE_LAST_TEAM: "امکان حذف آخرین تیم وجود ندارد",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"شما مجاز به به‌روزرسانی این عضو نیستید",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "حد عضویت در سازمان تکمیل شده است",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"شما مجاز به ایجاد تیم در این سازمان نیستید",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"شما مجاز به حذف تیم در این سازمان نیستید",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"شما مجاز به به‌روزرسانی این تیم نیستید",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "شما مجاز به حذف این تیم نیستید",
		INVITATION_LIMIT_REACHED: "حد دعوت‌نامه‌ها تکمیل شده است",
		TEAM_MEMBER_LIMIT_REACHED: "حد اعضای تیم تکمیل شده است",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "کاربر عضو تیم نیست",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"شما مجاز به مشاهده اعضای این تیم نیستید",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "شما تیم فعالی ندارید",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"شما مجاز به ایجاد عضو جدید نیستید",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"شما مجاز به حذف عضو تیم نیستید",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"شما مجاز به دسترسی به این سازمان به عنوان مالک نیستید",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "شما عضو این سازمان نیستید",
		MISSING_AC_INSTANCE:
			"کنترل دسترسی پویا نیاز به یک نمونه ac از پیش تعریف شده در افزونه سرور دارد",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"برای ایجاد نقش باید در یک سازمان باشید",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "شما مجاز به ایجاد نقش نیستید",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "شما مجاز به به‌روزرسانی نقش نیستید",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "شما مجاز به حذف نقش نیستید",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "شما مجاز به خواندن نقش نیستید",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "شما مجاز به لیست کردن نقش‌ها نیستید",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "شما مجاز به دریافت نقش نیستید",
		TOO_MANY_ROLES: "این سازمان نقش‌های بسیار زیادی دارد",
		INVALID_RESOURCE: "مجوز ارائه‌شده شامل یک منبع نامعتبر است",
		ROLE_NAME_IS_ALREADY_TAKEN: "این نام نقش قبلاً گرفته شده است",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "امکان حذف نقش پیش‌فرض وجود ندارد",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"امکان حذف نقشی که به اعضا اختصاص داده شده است وجود ندارد. لطفاً ابتدا اعضا را به نقش دیگری اختصاص دهید",
		INVALID_TEAM_ID: "شناسه تیم حاوی نویسه رزرو شده است",
	},
	fr: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Vous n'êtes pas autorisé à créer une nouvelle organisation",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Vous avez atteint le nombre maximum d'organisations",
		ORGANIZATION_ALREADY_EXISTS: "L'organisation existe déjà",
		ORGANIZATION_SLUG_ALREADY_TAKEN:
			"Le slug de l'organisation est déjà utilisé",
		ORGANIZATION_NOT_FOUND: "Organisation non trouvée",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"L'utilisateur n'est pas membre de l'organisation",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Vous n'êtes pas autorisé à mettre à jour cette organisation",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Vous n'êtes pas autorisé à supprimer cette organisation",
		NO_ACTIVE_ORGANIZATION: "Aucune organisation active",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"L'utilisateur est déjà membre de cette organisation",
		MEMBER_NOT_FOUND: "Membre non trouvé",
		ROLE_NOT_FOUND: "Rôle non trouvé",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Vous n'êtes pas autorisé à créer une nouvelle équipe",
		TEAM_ALREADY_EXISTS: "L'équipe existe déjà",
		TEAM_NOT_FOUND: "Équipe non trouvée",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Vous ne pouvez pas quitter l'organisation en tant qu'unique propriétaire",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Vous ne pouvez pas quitter l'organisation sans propriétaire",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Vous n'êtes pas autorisé à supprimer ce membre",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Vous n'êtes pas autorisé à inviter des utilisateurs dans cette organisation",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"L'utilisateur est déjà invité dans cette organisation",
		INVITATION_NOT_FOUND: "Invitation non trouvée",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Vous n'êtes pas le destinataire de l'invitation",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Vérification de l'e-mail requise avant d'accepter ou de rejeter l'invitation",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Vérification de l'e-mail requise pour voir les invitations",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Vous n'êtes pas autorisé à annuler cette invitation",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"L'invitant n'est plus membre de l'organisation",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Vous n'êtes pas autorisé à inviter un utilisateur avec ce rôle",
		FAILED_TO_RETRIEVE_INVITATION: "Échec de la récupération de l'invitation",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Vous avez atteint le nombre maximum d'équipes",
		UNABLE_TO_REMOVE_LAST_TEAM: "Impossible de supprimer la dernière équipe",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Vous n'êtes pas autorisé à mettre à jour ce membre",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Limite de membres de l'organisation atteinte",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Vous n'êtes pas autorisé à créer des équipes dans cette organisation",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Vous n'êtes pas autorisé à supprimer des équipes dans cette organisation",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Vous n'êtes pas autorisé à mettre à jour cette équipe",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Vous n'êtes pas autorisé à supprimer cette équipe",
		INVITATION_LIMIT_REACHED: "Limite d'invitations atteinte",
		TEAM_MEMBER_LIMIT_REACHED: "Limite de membres de l'équipe atteinte",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM:
			"L'utilisateur n'est pas membre de l'équipe",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Vous n'êtes pas autorisé à lister les membres de cette équipe",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Vous n'avez pas d'équipe active",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Vous n'êtes pas autorisé à créer un nouveau membre",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Vous n'êtes pas autorisé à retirer un membre de l'équipe",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Vous n'êtes pas autorisé à accéder à cette organisation en tant que propriétaire",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Vous n'êtes pas membre de cette organisation",
		MISSING_AC_INSTANCE:
			"Le contrôle d'accès dynamique nécessite une instance ac prédéfinie sur le plugin du serveur",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Vous devez être dans une organisation pour créer un rôle",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Vous n'êtes pas autorisé à créer un rôle",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Vous n'êtes pas autorisé à mettre à jour un rôle",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Vous n'êtes pas autorisé à supprimer un rôle",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Vous n'êtes pas autorisé à lire un rôle",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Vous n'êtes pas autorisé à lister un rôle",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Vous n'êtes pas autorisé à obtenir un rôle",
		TOO_MANY_ROLES: "Cette organisation a trop de rôles",
		INVALID_RESOURCE: "La permission fournie inclut une ressource invalide",
		ROLE_NAME_IS_ALREADY_TAKEN: "Ce nom de rôle est déjà pris",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Impossible de supprimer un rôle prédéfini",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Impossible de supprimer un rôle assigné à des membres. Veuillez réassigner les membres à un rôle différent en premier",
		INVALID_TEAM_ID: "L'ID de l'équipe contient un caractère réservé",
	},
	hi: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"आपको एक नया संगठन बनाने की अनुमति नहीं है",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"आप संगठनों की अधिकतम संख्या तक पहुँच गए हैं",
		ORGANIZATION_ALREADY_EXISTS: "संगठन पहले से मौजूद है",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "संगठन स्लग पहले से ही लिया जा चुका है",
		ORGANIZATION_NOT_FOUND: "संगठन नहीं मिला",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "उपयोगकर्ता संगठन का सदस्य नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"आपको इस संगठन को अपडेट करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"आपको इस संगठन को हटाने की अनुमति नहीं है",
		NO_ACTIVE_ORGANIZATION: "कोई सक्रिय संगठन नहीं है",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"उपयोगकर्ता पहले से ही इस संगठन का सदस्य है",
		MEMBER_NOT_FOUND: "सदस्य नहीं मिला",
		ROLE_NOT_FOUND: "भूमिका नहीं मिली",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"आपको एक नई टीम बनाने की अनुमति नहीं है",
		TEAM_ALREADY_EXISTS: "टीम पहले से मौजूद है",
		TEAM_NOT_FOUND: "टीम नहीं मिली",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"आप एकमात्र स्वामी के रूप में संगठन नहीं छोड़ सकते",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"आप बिना स्वामी के संगठन नहीं छोड़ सकते",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"आपको इस सदस्य को हटाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"आपको इस संगठन में उपयोगकर्ताओं को आमंत्रित करने की अनुमति नहीं है",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"उपयोगकर्ता को पहले से ही इस संगठन में आमंत्रित किया गया है",
		INVITATION_NOT_FOUND: "आमंत्रण नहीं मिला",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "आप आमंत्रण के प्राप्तकर्ता नहीं हैं",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"आमंत्रण स्वीकार या अस्वीकार करने से पहले ईमेल सत्यापन आवश्यक है",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"आमंत्रण देखने के लिए ईमेल सत्यापन आवश्यक है",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"आपको इस आमंत्रण को रद्द करने की अनुमति नहीं है",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"आमंत्रित करने वाला अब संगठन का सदस्य नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"आपको इस भूमिका वाले उपयोगकर्ता को आमंत्रित करने की अनुमति नहीं है",
		FAILED_TO_RETRIEVE_INVITATION: "आमंत्रण प्राप्त करने में विफल",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"आप टीमों की अधिकतम संख्या तक पहुँच गए हैं",
		UNABLE_TO_REMOVE_LAST_TEAM: "अंतिम टीम को हटाने में असमर्थ",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"आपको इस सदस्य को अपडेट करने की अनुमति नहीं है",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "संगठन सदस्यता सीमा पूरी हो गई है",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"आपको इस संगठन में टीमें बनाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"आपको इस संगठन में टीमों को हटाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"आपको इस टीम को अपडेट करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"आपको इस टीम को हटाने की अनुमति नहीं है",
		INVITATION_LIMIT_REACHED: "आमंत्रण सीमा पूरी हो गई है",
		TEAM_MEMBER_LIMIT_REACHED: "टीम सदस्य सीमा पूरी हो गई है",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "उपयोगकर्ता टीम का सदस्य नहीं है",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"आपको इस टीम के सदस्यों को सूचीबद्ध करने की अनुमति नहीं है",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "आपके पास कोई सक्रिय टीम नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"आपको एक नया सदस्य बनाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"आपको टीम के सदस्य को हटाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"आपको स्वामी के रूप में इस संगठन तक पहुँचने की अनुमति नहीं है",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "आप इस संगठन के सदस्य नहीं हैं",
		MISSING_AC_INSTANCE:
			"डायनामिक एक्सेस कंट्रोल के लिए सर्वर प्लगइन पर एक पूर्व-निर्धारित ac इंस्टेंस की आवश्यकता होती है",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"भूमिका बनाने के लिए आपका संगठन में होना आवश्यक है",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "आपको भूमिका बनाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "आपको भूमिका अपडेट करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "आपको भूमिका हटाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "आपको भूमिका पढ़ने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"आपको भूमिकाओं को सूचीबद्ध करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "आपको भूमिका प्राप्त करने की अनुमति नहीं है",
		TOO_MANY_ROLES: "इस संगठन में बहुत अधिक भूमिकाएँ हैं",
		INVALID_RESOURCE: "प्रदान की गई अनुमति में एक अमान्य संसाधन शामिल है",
		ROLE_NAME_IS_ALREADY_TAKEN: "वह भूमिका नाम पहले से ही लिया जा चुका है",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "पूर्व-निर्धारित भूमिका को हटाया नहीं जा सकता",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"सदस्य को सौंपी गई भूमिका को हटाया नहीं जा सकता। कृपया पहले सदस्यों को एक अलग भूमिका सौंपें",
		INVALID_TEAM_ID: "टीम आईडी में एक आरक्षित वर्ण है",
	},
	id: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Anda tidak diizinkan membuat organisasi baru",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Anda telah mencapai jumlah maksimum organisasi",
		ORGANIZATION_ALREADY_EXISTS: "Organisasi sudah ada",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Slug organisasi sudah digunakan",
		ORGANIZATION_NOT_FOUND: "Organisasi tidak ditemukan",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Pengguna bukan anggota organisasi",
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
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Anda tidak diizinkan menghapus peran",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "Anda tidak diizinkan membaca peran",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Anda tidak diizinkan mencantumkan peran",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "Anda tidak diizinkan mendapatkan peran",
		TOO_MANY_ROLES: "Organisasi ini memiliki terlalu banyak peran",
		INVALID_RESOURCE:
			"Izin yang diberikan mencakup sumber daya yang tidak valid",
		ROLE_NAME_IS_ALREADY_TAKEN: "Nama peran tersebut sudah digunakan",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Tidak dapat menghapus peran yang telah ditentukan sebelumnya",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Tidak dapat menghapus peran yang ditetapkan untuk anggota. Silakan tetapkan anggota ke peran lain terlebih dahulu",
		INVALID_TEAM_ID: "ID tim berisi karakter yang dicadangkan",
	},
	it: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Non sei autorizzato a creare una nuova organizzazione",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Hai raggiunto il numero massimo di organizzazioni",
		ORGANIZATION_ALREADY_EXISTS: "L'organizzazione esiste già",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Slug dell'organizzazione già utilizzato",
		ORGANIZATION_NOT_FOUND: "Organizzazione non trovata",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"L'utente non è un membro dell'organizzazione",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Non sei autorizzato ad aggiornare questa organizzazione",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Non sei autorizzato a eliminare questa organizzazione",
		NO_ACTIVE_ORGANIZATION: "Nessuna organizzazione attiva",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"L'utente è già membro di questa organizzazione",
		MEMBER_NOT_FOUND: "Membro non trovato",
		ROLE_NOT_FOUND: "Ruolo non trovato",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Non sei autorizzato a creare un nuovo team",
		TEAM_ALREADY_EXISTS: "Il team esiste già",
		TEAM_NOT_FOUND: "Team non trovato",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Non puoi lasciare l'organizzazione come unico proprietario",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Non puoi lasciare l'organizzazione senza un proprietario",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Non sei autorizzato a eliminare questo membro",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Non sei autorizzato a invitare utenti in questa organizzazione",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"L'utente è già invitato in questa organizzazione",
		INVITATION_NOT_FOUND: "Invito non trovato",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Non sei il destinatario dell'invito",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Verifica e-mail richiesta prima di accettare o rifiutare l'invito",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Verifica e-mail richiesta per visualizzare gli inviti",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Non sei autorizzato a cancellare questo invito",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Chi ha invitato non è più membro dell'organizzazione",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Non sei autorizzato a invitare un utente con questo ruolo",
		FAILED_TO_RETRIEVE_INVITATION: "Impossibile recuperare l'invito",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Hai raggiunto il numero massimo di team",
		UNABLE_TO_REMOVE_LAST_TEAM: "Impossibile rimuovere l'ultimo team",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Non sei autorizzato ad aggiornare questo membro",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Limite di membri dell'organizzazione raggiunto",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Non sei autorizzato a creare team in questa organizzazione",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Non sei autorizzato a eliminare team in questa organizzazione",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Non sei autorizzato ad aggiornare questo team",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Non sei autorizzato a eliminare questo team",
		INVITATION_LIMIT_REACHED: "Limite di inviti raggiunto",
		TEAM_MEMBER_LIMIT_REACHED: "Limite di membri del team raggiunto",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "L'utente non è membro del team",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Non sei autorizzato a elencare i membri di questo team",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Non hai un team attivo",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Non sei autorizzato a creare un nuovo membro",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Non sei autorizzato a rimuovere un membro del team",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Non sei autorizzato ad accedere a questa organizzazione come proprietario",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Non sei membro di questa organizzazione",
		MISSING_AC_INSTANCE:
			"Il Controllo Accessi Dinamico richiede un'istanza ac predefinita sul plugin del server",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Devi essere in un'organizzazione per creare un ruolo",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Non sei autorizzato a creare un ruolo",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Non sei autorizzato a aggiornare un ruolo",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Non sei autorizzato a eliminare un ruolo",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Non sei autorizzato a leggere un ruolo",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Non sei autorizzato a elencare un ruolo",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Non sei autorizzato a ottenere un ruolo",
		TOO_MANY_ROLES: "Questa organizzazione ha troppi ruoli",
		INVALID_RESOURCE: "La permissione fornita include una risorsa non valida",
		ROLE_NAME_IS_ALREADY_TAKEN: "Questo nome di ruolo è già in uso",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Impossibile eliminare un ruolo predefinito",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Impossibile eliminare un ruolo assegnato ai membri. Si prega di riassegnare prima i membri a un ruolo diverso",
		INVALID_TEAM_ID: "L'ID del team contiene un carattere riservato",
	},
	ja: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"新しい組織を作成することは許可されていません",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"組織の最大数に達しました",
		ORGANIZATION_ALREADY_EXISTS: "組織はすでに存在します",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "組織のスラッグはすでに使用されています",
		ORGANIZATION_NOT_FOUND: "組織が見つかりません",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"ユーザーは組織のメンバーではありません",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"この組織を更新することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"この組織を削除することは許可されていません",
		NO_ACTIVE_ORGANIZATION: "アクティブな組織がありません",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"ユーザーはすでにこの組織のメンバーです",
		MEMBER_NOT_FOUND: "メンバーが見つかりません",
		ROLE_NOT_FOUND: "役割が見つかりません",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"新しいチームを作成することは許可されていません",
		TEAM_ALREADY_EXISTS: "チームはすでに存在します",
		TEAM_NOT_FOUND: "チームが見つかりません",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"唯一の所有者として組織を脱退することはできません",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"所有者なしで組織を脱退することはできません",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"このメンバーを削除することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"この組織にユーザーを招待することは許可されていません",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"ユーザーはすでにこの組織に招待されています",
		INVITATION_NOT_FOUND: "招待が見つかりません",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"あなたは招待の受信者ではありません",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"招待を承諾または拒否する前にメール認証が必要です",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"招待を表示するにはメール認証が必要です",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"この招待をキャンセルすることは許可されていません",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"招待者はすでに組織のメンバーではありません",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"この役割のユーザーを招待することは許可されていません",
		FAILED_TO_RETRIEVE_INVITATION: "招待の取得に失敗しました",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS: "チームの最大数に達しました",
		UNABLE_TO_REMOVE_LAST_TEAM: "最後のチームを削除できません",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"このメンバーを更新することは許可されていません",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"組織のメンバーシップ制限に達しました",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"この組織でチームを作成することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"この組織でチームを削除することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"このチームを更新することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"このチームを削除することは許可されていません",
		INVITATION_LIMIT_REACHED: "招待制限に達しました",
		TEAM_MEMBER_LIMIT_REACHED: "チームメンバー制限に達しました",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM:
			"ユーザーはチームのメンバーではありません",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"このチームのメンバーを一覧表示することは許可されていません",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "アクティブなチームがありません",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"新しいメンバーを作成することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"チームメンバーを削除することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"所有者としてこの組織にアクセスすることは許可されていません",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"あなたはこの組織のメンバーではありません",
		MISSING_AC_INSTANCE:
			"動的アクセス制御には、サーバーの認証プラグインにあらかじめ定義されたacインスタンスが必要です",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"役割を作成するには組織に所属している必要があります",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"役割を作成することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"役割を更新することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"役割を削除することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"役割を読み取ることは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"役割を一覧表示することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "役割を取得することは許可されていません",
		TOO_MANY_ROLES: "この組織には役割が多すぎます",
		INVALID_RESOURCE: "指定された権限に無効なリソースが含まれています",
		ROLE_NAME_IS_ALREADY_TAKEN: "その役割名はすでに使用されています",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"定義済みの役割を削除することはできません",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"メンバーに割り当てられている役割を削除することはできません。まず、メンバーを別の役割に割り当て直してください",
		INVALID_TEAM_ID: "チームIDに予約文字が含まれています",
	},
	ko: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"새 조직을 생성할 권한이 없습니다",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"조직 최대 수에 도달했습니다",
		ORGANIZATION_ALREADY_EXISTS: "조직이 이미 존재합니다",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "이미 사용 중인 조직 슬러그입니다",
		ORGANIZATION_NOT_FOUND: "조직을 찾을 수 없습니다",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "사용자가 조직의 멤버가 아닙니다",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"이 조직을 업데이트할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"이 조직을 삭제할 권한이 없습니다",
		NO_ACTIVE_ORGANIZATION: "활성화된 조직이 없습니다",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"사용자가 이미 이 조직의 멤버입니다",
		MEMBER_NOT_FOUND: "멤버를 찾을 수 없습니다",
		ROLE_NOT_FOUND: "역할을 찾을 수 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "새 팀을 생성할 권한이 없습니다",
		TEAM_ALREADY_EXISTS: "팀이 이미 존재합니다",
		TEAM_NOT_FOUND: "팀을 찾을 수 없습니다",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"유일한 소유자로서 조직을 탈퇴할 수 없습니다",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"소유자 없이 조직을 탈퇴할 수 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"이 멤버를 삭제할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"이 조직에 사용자를 초대할 권한이 없습니다",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"사용자가 이미 이 조직에 초대되었습니다",
		INVITATION_NOT_FOUND: "초대장을 찾을 수 없습니다",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"귀하는 초대장의 수신자가 아닙니다",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"초대를 수락하거나 거절하기 전에 이메일 인증이 필요합니다",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"초대장을 보려면 이메일 인증이 필요합니다",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"이 초대를 취소할 권한이 없습니다",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"초대자가 더 이상 조직의 멤버가 아닙니다",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"이 역할의 사용자를 초대할 권한이 없습니다",
		FAILED_TO_RETRIEVE_INVITATION: "초대장을 가져오지 못했습니다",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS: "팀 최대 수에 도달했습니다",
		UNABLE_TO_REMOVE_LAST_TEAM: "마지막 팀을 삭제할 수 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"이 멤버를 업데이트할 권한이 없습니다",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "조직 멤버 제한에 도달했습니다",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"이 조직에서 팀을 생성할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"이 조직에서 팀을 삭제할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"이 팀을 업데이트할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "이 팀을 삭제할 권한이 없습니다",
		INVITATION_LIMIT_REACHED: "초대 한도에 도달했습니다",
		TEAM_MEMBER_LIMIT_REACHED: "팀 멤버 제한에 도달했습니다",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "사용자가 팀의 멤버가 아닙니다",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"이 팀의 멤버를 조회할 권한이 없습니다",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "활성화된 팀이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"새 멤버를 생성할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"팀 멤버를 제거할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"소유자로서 이 조직에 접근할 권한이 없습니다",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"귀하는 이 조직의 멤버가 아닙니다",
		MISSING_AC_INSTANCE:
			"동적 액세스 제어를 사용하려면 서버 인증 플러그인에 ac 인스턴스가 미리 정의되어 있어야 합니다",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"역할을 생성하려면 조직에 속해 있어야 합니다",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "역할을 생성할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "역할을 업데이트할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "역할을 삭제할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "역할을 조회할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "역할 목록을 조회할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "역할을 가져올 권한이 없습니다",
		TOO_MANY_ROLES: "이 조직에 역할이 너무 많습니다",
		INVALID_RESOURCE: "제공된 권한에 유효하지 않은 리소스가 포함되어 있습니다",
		ROLE_NAME_IS_ALREADY_TAKEN: "해당 역할 이름은 이미 사용 중입니다",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"기본으로 정의된 역할은 삭제할 수 없습니다",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"멤버에게 할당된 역할은 삭제할 수 없습니다. 먼저 멤버에게 다른 역할을 할당하세요",
		INVALID_TEAM_ID: "팀 ID에 예약된 문자가 포함되어 있습니다",
	},
	nl: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Je bent nicht gemachtigd om een nieuwe organisatie aan te maken",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Je hebt het maximum aantal organisaties bereikt",
		ORGANIZATION_ALREADY_EXISTS: "Organisatie bestaat al",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Organisatie-slug is al in gebruik",
		ORGANIZATION_NOT_FOUND: "Organisatie niet gevonden",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Gebruiker is geen lid van de organisatie",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Je bent niet gemachtigd om deze organisatie bij te werken",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Je bent niet gemachtigd om deze organisatie te verwijderen",
		NO_ACTIVE_ORGANIZATION: "Geen actieve organisatie",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Gebruiker is al lid van deze organisatie",
		MEMBER_NOT_FOUND: "Lid niet gevonden",
		ROLE_NOT_FOUND: "Rol niet gevonden",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Je bent niet gemachtigd om een nieuw team aan te maken",
		TEAM_ALREADY_EXISTS: "Team bestaat al",
		TEAM_NOT_FOUND: "Team niet gevonden",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Je kunt de organisatie niet verlaten als de enige eigenaar",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Je kunt de organisatie niet verlaten zonder een eigenaar",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Je bent niet gemachtigd om dit lid te verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Je bent niet gemachtigd om gebruikers uit te nodigen voor deze organisatie",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Gebruiker is al uitgenodigd voor deze organisatie",
		INVITATION_NOT_FOUND: "Uitnodiging niet gevonden",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Je bent niet de ontvanger van de uitnodiging",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"E-mailverificatie vereist voordat uitnodiging kan worden geaccepteerd of geweigerd",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"E-mailverificatie vereist om uitnodigingen te bekijken",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Je bent niet gemachtigd om deze uitnodiging te annuleren",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"De uitnodiger is geen lid meer van de organisatie",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Je bent niet gemachtigd om een gebruiker met deze rol uit te nodigen",
		FAILED_TO_RETRIEVE_INVITATION: "Mislukt om uitnodiging op te halen",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Je hebt het maximum aantal teams bereikt",
		UNABLE_TO_REMOVE_LAST_TEAM: "Onmogelijk om het laatste team te verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Je bent niet gemachtigd om dit lid bij te werken",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Limiet voor organisatielidmaatschappen bereikt",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Je bent niet gemachtigd om teams in deze organisatie aan te maken",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Je bent niet gemachtigd om teams in deze organisatie te verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Je bent niet gemachtigd om dit team bij te werken",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Je bent niet gemachtigd om dit team te verwijderen",
		INVITATION_LIMIT_REACHED: "Uitnodigingslimiet bereikt",
		TEAM_MEMBER_LIMIT_REACHED: "Limiet voor teamleden bereikt",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Gebruiker is geen lid van het team",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Je bent niet gemachtigd om de leden van dit team te tonen",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Je hebt geen actief team",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Je bent niet gemachtigd om een nieuw lid aan te maken",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Je bent niet gemachtigd om een teamlid te verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Je bent niet gemachtigd om toegang te krijgen tot deze organisatie als eigenaar",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Je bent geen lid van deze organisatie",
		MISSING_AC_INSTANCE:
			"Dynamische toegangscontrole vereist een vooraf gedefinieerde ac-instantie op de serverauth-plugin",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Je moet in een organisatie zijn om een rol te creëren",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Je bent niet gemachtigd om een rol te creëren",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Je bent niet gemachtigd om een rol bij te werken",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Je bent nicht gemachtigd om een rol te verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Je bent niet gemachtigd om een rol te lezen",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Je bent niet gemachtigd om een rol te tonen",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Je bent niet gemachtigd om een rol op te halen",
		TOO_MANY_ROLES: "Deze organisatie heeft te veel rollen",
		INVALID_RESOURCE: "De opgegeven machtiging bevat een ongeldige bron",
		ROLE_NAME_IS_ALREADY_TAKEN: "Die rolnaam is al in gebruik",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Kan een vooraf gedefinieerde rol niet verwijderen",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Kan een rol die aan leden is toegewezen niet verwijderen. Wijs de leden eerst aan een andere rol toe",
		INVALID_TEAM_ID: "Team-id bevat een gereserveerd teken",
	},
	pl: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Nie masz uprawnień do tworzenia nowej organizacji",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Ociągnąłeś maksymalną liczbę organizacji",
		ORGANIZATION_ALREADY_EXISTS: "Organizacja już istnieje",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Ten slug organizacji jest już zajęty",
		ORGANIZATION_NOT_FOUND: "Organizacja nie została znaleziona",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Użytkownik nie jest członkiem organizacji",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Nie masz uprawnień do aktualizowania tej organizacji",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Nie masz uprawnień do usuwania tej organizacji",
		NO_ACTIVE_ORGANIZATION: "Brak aktywnej organizacji",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Użytkownik jest już członkiem tej organizacji",
		MEMBER_NOT_FOUND: "Członek nie został znaleziony",
		ROLE_NOT_FOUND: "Rola nie została znaleziona",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Nie masz uprawnień do tworzenia nowego zespołu",
		TEAM_ALREADY_EXISTS: "Zespół już istnieje",
		TEAM_NOT_FOUND: "Zespół nie został znaleziony",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Nie możesz opuścić organizacji jako jej jedyny właściciel",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Nie możesz opuścić organizacji bez właściciela",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Nie masz uprawnień do usunięcia tego członka",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Nie masz uprawnień do zapraszania użytkowników do tej organizacji",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Użytkownik został już zaproszony do tej organizacji",
		INVITATION_NOT_FOUND: "Zaproszenie nie zostało znalezione",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Nie jesteś odbiorcą tego zaproszenia",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Przed zaakceptowaniem lub odrzuceniem zaproszenia wymagana jest weryfikacja adresu e-mail",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Wymagana weryfikacja adresu e-mail, aby zobaczyć zaproszenia",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Nie masz uprawnień do anulowania tego zaproszenia",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Zapraszający nie jest już członkiem organizacji",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Nie masz uprawnień do zaproszenia użytkownika z tą rolą",
		FAILED_TO_RETRIEVE_INVITATION: "Nie udało się pobrać zaproszenia",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Ociągnąłeś maksymalną liczbę zespołów",
		UNABLE_TO_REMOVE_LAST_TEAM: "Nie można usunąć ostatniego zespołu",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Nie masz uprawnień do aktualizowania tego członka",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Ociągnięto limit członków organizacji",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Nie masz uprawnień do tworzenia zespołów w tej organizacji",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Nie masz uprawnień do usuwania zespołów w tej organizacji",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Nie masz uprawnień do aktualizowania tego zespołu",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Nie masz uprawnień do usunięcia tego zespołu",
		INVITATION_LIMIT_REACHED: "Ociągnięto limit zaproszeń",
		TEAM_MEMBER_LIMIT_REACHED: "Ociągnięto limit członków zespołu",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Użytkownik nie jest członkiem zespołu",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Nie masz uprawnień do wyświetlania członków tego zespołu",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Nie masz aktywnego zespołu",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Nie masz uprawnień do tworzenia nowego członka",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Nie masz uprawnień do usunięcia członka zespołu",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Nie masz uprawnień dostępu do tej organizacji jako właściciel",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Nie jesteś członkiem tej organizacji",
		MISSING_AC_INSTANCE:
			"Dynamiczna kontrola dostępu wymaga zdefiniowanej instancji ac w pluginie serwera",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Musisz być w organizacji, aby utworzyć rolę",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Nie masz uprawnień do tworzenia roli",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Nie masz uprawnień do modyfikowania roli",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "Nie masz uprawnień do usuwania roli",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Nie masz uprawnień do odczytywania roli",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "Nie masz uprawnień do listowania roli",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "Nie masz uprawnień do pobierania roli",
		TOO_MANY_ROLES: "Ta organizacja posiada zbyt wiele ról",
		INVALID_RESOURCE: "Podane uprawnienie zawiera nieprawidłowy zasób",
		ROLE_NAME_IS_ALREADY_TAKEN: "Nazwa roli jest już zajęta",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Nie można usunąć roli wbudowanej",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Nie można usunąć roli przypisanej do członków. Proszę najpierw przypisać członków do innej roli",
		INVALID_TEAM_ID: "ID zespołu zawiera zarezerwowany znak",
	},
	pt: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Você não tem permissão para criar uma nova organização",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Você atingiu o número máximo de organizações",
		ORGANIZATION_ALREADY_EXISTS: "A organização já existe",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "O slug da organização já está em uso",
		ORGANIZATION_NOT_FOUND: "Organização não encontrada",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"O usuário não é membro da organização",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Você não tem permissão para atualizar esta organização",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Você não tem permissão para excluir esta organização",
		NO_ACTIVE_ORGANIZATION: "Nenhuma organização ativa",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"O usuário já é membro desta organização",
		MEMBER_NOT_FOUND: "Membro não encontrado",
		ROLE_NOT_FOUND: "Função não encontrada",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Você não tem permissão para criar uma nova equipe",
		TEAM_ALREADY_EXISTS: "A equipe já existe",
		TEAM_NOT_FOUND: "Equipe não encontrada",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Você não pode deixar a organização sendo o único proprietário",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Você não pode deixar a organização sem um proprietário",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Você não tem permissão para excluir este membro",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Você não tem permissão para convidar usuários para esta organização",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"O usuário já foi convidado para esta organização",
		INVITATION_NOT_FOUND: "Convite não encontrado",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Você não é o destinatário do convite",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Verificação de e-mail necessária antes de aceitar ou rejeitar o convite",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Verificação de e-mail necessária para visualizar os convites",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Você não tem permissão para cancelar este convite",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"O convidando não é mais membro da organização",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Você não tem permissão para convidar um usuário com esta função",
		FAILED_TO_RETRIEVE_INVITATION: "Falha ao recuperar o convite",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Você atingiu o número máximo de equipes",
		UNABLE_TO_REMOVE_LAST_TEAM: "Não é possível remover a última equipe",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Você não tem permissão para atualizar este membro",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Limite de membros da organização atingido",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Você não tem permissão para criar equipes nesta organização",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Você não tem permissão para excluir equipes nesta organização",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Você não tem permissão para atualizar esta equipe",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Você não tem permissão para excluir esta equipe",
		INVITATION_LIMIT_REACHED: "Limite de convites atingido",
		TEAM_MEMBER_LIMIT_REACHED: "Limite de membros da equipe atingido",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "O usuário não é membro da equipe",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Você não tem permissão para listar os membros desta equipe",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Você não tem uma equipe ativa",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Você não tem permissão para criar um novo membro",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Você não tem permissão para remover um membro da equipe",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Você não tem permissão para acessar esta organização como proprietário",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Você não é membro desta organização",
		MISSING_AC_INSTANCE:
			"O Controle de Acesso Dinâmico requer uma instância ac predefinida no plugin do servidor",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Você deve estar em uma organização para criar uma função",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Você não tem permissão para criar uma função",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Você não tem permissão para atualizar uma função",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Você não tem permissão para excluir uma função",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Você não tem permissão para ler uma função",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Você não tem permissão para listar funções",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Você não tem permissão para obter uma função",
		TOO_MANY_ROLES: "Esta organização tem funções demais",
		INVALID_RESOURCE: "A permissão fornecida inclui um recurso inválido",
		ROLE_NAME_IS_ALREADY_TAKEN: "Esse nome de função já está em uso",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Não é possível excluir uma função predefinida",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Não é possível excluir uma função que está atribuída a membros. Por favor, reatribua os membros a uma função diferente primeiro",
		INVALID_TEAM_ID: "O ID da equipe contém um caractere reservado",
	},
	ru: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"У вас нет прав для создания новой организации",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Вы достигли максимального количества организаций",
		ORGANIZATION_ALREADY_EXISTS: "Организация уже существует",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Этот слаг организации уже занят",
		ORGANIZATION_NOT_FOUND: "Организация не найдена",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Пользователь не является членом организации",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"У вас нет прав для изменения этой организации",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"У вас нет прав для удаления этой организации",
		NO_ACTIVE_ORGANIZATION: "Нет активной организации",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Пользователь уже является членом этой организации",
		MEMBER_NOT_FOUND: "Член организации не найден",
		ROLE_NOT_FOUND: "Роль не найдена",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"У вас нет прав для создания новой команды",
		TEAM_ALREADY_EXISTS: "Команда уже существует",
		TEAM_NOT_FOUND: "Команда не найдена",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Вы не можете покинуть организацию, так как являетесь единственным владельцем",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Вы не можете покинуть организацию без владельца",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"У вас нет прав для удаления этого члена организации",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"У вас нет прав для приглашения пользователей в эту организацию",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Пользователь уже приглашен в эту организацию",
		INVITATION_NOT_FOUND: "Приглашение не найдено",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Вы не являетесь получателем этого приглашения",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Перед принятием или отклонением приглашения требуется подтверждение email",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Требуется подтверждение email для просмотра приглашений",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"У вас нет прав для отмены этого приглашения",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Пригласивший пользователь больше не является членом организации",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"У вас нет прав для приглашения пользователя с такой ролью",
		FAILED_TO_RETRIEVE_INVITATION: "Не удалось получить приглашение",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Вы достигли максимального количества команд",
		UNABLE_TO_REMOVE_LAST_TEAM:
			"Невозможно удалить единственную оставшуюся команду",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"У вас нет прав для изменения этого члена организации",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "Превышен лимит членов организации",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"У вас нет прав для создания команд в этой организации",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"У вас нет прав для удаления команд в этой организации",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"У вас нет прав для изменения этой команды",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"У вас нет прав для удаления этой команды",
		INVITATION_LIMIT_REACHED: "Превышен лимит приглашений",
		TEAM_MEMBER_LIMIT_REACHED: "Превышен лимит участников команды",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Пользователь не является членом команды",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"У вас нет прав для просмотра списка участников этой команды",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "У вас нет активной команды",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"У вас нет прав для добавления нового участника",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"У вас нет прав для удаления участника команды",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"У вас нет прав доступа к этой организации на правах владельца",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Вы не являетесь членом этой организации",
		MISSING_AC_INSTANCE:
			"Динамический контроль доступа требует наличия предопределенного инстанса ac в серверном плагине",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Вы должны состоять в организации, чтобы создать роль",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "У вас нет прав для создания роли",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "У вас нет прав для изменения роли",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "У вас нет прав для удаления роли",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "У вас нет прав для чтения роли",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"У вас нет прав для просмотра списка ролей",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "У вас нет прав для получения роли",
		TOO_MANY_ROLES: "В этой организации слишком много ролей",
		INVALID_RESOURCE: "Указанное разрешение содержит недопустимый ресурс",
		ROLE_NAME_IS_ALREADY_TAKEN: "Имя роли уже занято",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Невозможно удалить предопределенную роль",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Невозможно удалить роль, назначенную пользователям. Сначала переназначьте пользователей на другую роль",
		INVALID_TEAM_ID: "ID команды содержит зарезервированный символ",
	},
	sv: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Du har inte tillåtelse att skapa en ny organisation",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Du har nått det maximala antalet organisationer",
		ORGANIZATION_ALREADY_EXISTS: "Organisationen finns redan",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Organisationens slug är redan tagen",
		ORGANIZATION_NOT_FOUND: "Organisationen hittades inte",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Användaren är inte medlem i organisationen",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Du har inte tillåtelse att uppdatera denna organisation",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Du har inte tillåtelse att ta bort denna organisation",
		NO_ACTIVE_ORGANIZATION: "Ingen aktiv organisation",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Användaren är redan medlem i denna organisation",
		MEMBER_NOT_FOUND: "Medlemmen hittades inte",
		ROLE_NOT_FOUND: "Rollen hittades inte",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Du har inte tillåtelse att skapa ett nytt team",
		TEAM_ALREADY_EXISTS: "Teamet finns redan",
		TEAM_NOT_FOUND: "Teamet hittades inte",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Du kan inte lämna organisationen som den enda ägaren",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Du kan inte lämna organisationen utan en ägare",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Du har inte tillåtelse att ta bort denna medlem",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Du har inte tillåtelse att bjuda in användare till denna organisation",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Användaren är redan inbjuden till denna organisation",
		INVITATION_NOT_FOUND: "Inbjudan hittades inte",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Du är inte mottagaren av inbjudan",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"E-postverifiering krävs innan inbjudan kan accepteras eller avvisas",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"E-postverifiering krävs för att visa inbjudningar",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Du har inte tillåtelse att avbryta denna inbjudan",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Inbjudaren är inte längre medlem i organisationen",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Du har inte tillåtelse att bjuda in en användare med denna roll",
		FAILED_TO_RETRIEVE_INVITATION: "Det gick inte att hämta inbjudan",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Du har nått det maximala antalet team",
		UNABLE_TO_REMOVE_LAST_TEAM: "Det går inte att ta bort det sista teamet",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Du har inte tillåtelse att uppdatera denna medlem",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Gränsen för organisationsmedlemskap har nåtts",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Du har inte tillåtelse att skapa team i denna organisation",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Du har inte tillåtelse att ta bort team i denna organisation",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Du har inte tillåtelse att uppdatera detta team",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"Du har inte tillåtelse att ta bort detta team",
		INVITATION_LIMIT_REACHED: "Inbjudningsgränsen har nåtts",
		TEAM_MEMBER_LIMIT_REACHED: "Teammedlemsgränsen har nåtts",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Användaren är inte medlem i teamet",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Du har inte tillåtelse att lista medlemmarna i detta team",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Du har inget aktivt team",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Du har inte tillåtelse att skapa en ny medlem",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Du har inte tillåtelse att ta bort en teammedlem",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Du har inte tillåtelse att komma åt denna organisation som ägare",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Du är inte medlem i denna organisation",
		MISSING_AC_INSTANCE:
			"Dynamisk åtkomstkontroll kräver en fördefinierad ac-instans på serverns autentiseringsplugin",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Du måste vara i en organisation för att skapa en roll",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Du har inte tillåtelse att skapa en roll",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Du har inte tillåtelse att uppdatera en roll",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
			"Du har inte tillåtelse att ta bort en roll",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Du har inte tillåtelse att läsa en roll",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Du har inte tillåtelse att lista roller",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Du har inte tillåtelse att hämta en roll",
		TOO_MANY_ROLES: "Denna organisation har för många roller",
		INVALID_RESOURCE: "Den angivna behörigheten innehåller en ogiltig resurs",
		ROLE_NAME_IS_ALREADY_TAKEN: "Det rollnamnet är redan taget",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Kan inte ta bort en fördefinierad roll",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Kan inte ta bort en roll som är tilldelad medlemmar. Vänligen tilldela medlemmarna till en annan roll först",
		INVALID_TEAM_ID: "Team-ID innehåller ett reserverat tecken",
	},
	th: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"คุณไม่ได้รับอนุญาตให้สร้างองค์กรใหม่",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"คุณมีจำนวนองค์กรครบตามกำหนดสูงสุดแล้ว",
		ORGANIZATION_ALREADY_EXISTS: "องค์กรมีอยู่แล้ว",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "สลักองค์กรถูกใช้งานแล้ว",
		ORGANIZATION_NOT_FOUND: "ไม่พบองค์กร",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "ผู้ใช้ไม่ได้เป็นสมาชิกขององค์กร",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"คุณไม่ได้รับอนุญาตให้อัปเดตองค์กรนี้",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION: "คุณไม่ได้รับอนุญาตให้ลบองค์กรนี้",
		NO_ACTIVE_ORGANIZATION: "ไม่มีองค์กรที่เปิดใช้งานอยู่",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "ผู้ใช้เป็นสมาชิกขององค์กรนี้อยู่แล้ว",
		MEMBER_NOT_FOUND: "ไม่พบสมาชิก",
		ROLE_NOT_FOUND: "ไม่พบการกําหนดบทบาท",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "คุณไม่ได้รับอนุญาตให้สร้างทีมใหม่",
		TEAM_ALREADY_EXISTS: "ทีมมีอยู่แล้ว",
		TEAM_NOT_FOUND: "ไม่พบทีม",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"คุณไม่สามารถออกจากองค์กรในฐานะเจ้าของเพียงคนเดียวได้",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"คุณไม่สามารถออกจากองค์กรโดยไม่มีเจ้าของได้",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "คุณไม่ได้รับอนุญาตให้ลบสมาชิกรายนี้",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"คุณไม่ได้รับอนุญาตให้เชิญผู้ใช้เข้าสู่องค์กรนี้",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "ผู้ใช้ได้รับเชิญเข้าสู่องค์กรนี้แล้ว",
		INVITATION_NOT_FOUND: "ไม่พบคำเชิญ",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "คุณไม่ใช่ผู้รับคำเชิญนี้",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"จำเป็นต้องยืนยันอีเมลก่อนยอมรับหรือปฏิเสธคำเชิญ",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION: "จำเป็นต้องยืนยันอีเมลเพื่อดูคำเชิญ",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION: "คุณไม่ได้รับอนุญาตให้ยกเลิกคำเชิญนี้",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"ผู้เชิญไม่ได้เป็นสมาชิกขององค์กรอีกต่อไป",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"คุณไม่ได้รับอนุญาตให้เชิญผู้ใช้ที่มีบทบาทนี้",
		FAILED_TO_RETRIEVE_INVITATION: "ดึงข้อมูลคำเชิญไม่สำเร็จ",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"คุณมีจำนวนทีมครบตามกำหนดสูงสุดแล้ว",
		UNABLE_TO_REMOVE_LAST_TEAM: "ไม่สามารถลบทีมสุดท้ายได้",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "คุณไม่ได้รับอนุญาตให้อัปเดตสมาชิกรายนี้",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "จำนวนสมาชิกในองค์กรถึงขีดจำกัดแล้ว",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"คุณไม่ได้รับอนุญาตให้สร้างทีมในองค์กรนี้",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"คุณไม่ได้รับอนุญาตให้ลบทีมในองค์กรนี้",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "คุณไม่ได้รับอนุญาตให้อัปเดตทีมนี้",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "คุณไม่ได้รับอนุญาตให้ลบทีมนี้",
		INVITATION_LIMIT_REACHED: "ถึงขีดจำกัดการส่งคำเชิญแล้ว",
		TEAM_MEMBER_LIMIT_REACHED: "ถึงขีดจำกัดสมาชิกในทีมแล้ว",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "ผู้ใช้ไม่ได้เป็นสมาชิกของทีม",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"คุณไม่ได้รับอนุญาตให้แสดงรายการสมาชิกของทีมนี้",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "คุณไม่มีทีมที่ใช้งานอยู่",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"คุณไม่ได้รับอนุญาตให้เพิ่มสมาชิกใหม่",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER: "คุณไม่ได้รับอนุญาตให้ลบสมาชิกทีมออก",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"คุณไม่ได้รับอนุญาตให้เข้าถึงองค์กรนี้ในฐานะเจ้าของ",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "คุณไม่ได้เป็นสมาชิกขององค์กรนี้",
		MISSING_AC_INSTANCE:
			"การควบคุมการเข้าถึงแบบไดนามิกจำเป็นต้องมีอินสแตนซ์ ac ที่กำหนดไว้ล่วงหน้าบนปลั๊กอินเซิร์ฟเวอร์",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"คุณต้องอยู่ในองค์กรก่อนจึงจะสามารถสร้างบทบาทได้",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "คุณไม่ได้รับอนุญาตให้สร้างบทบาท",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "คุณไม่ได้รับอนุญาตให้อัปเดตบทบาท",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "คุณไม่ได้รับอนุญาตให้ลบบทบาท",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "คุณไม่ได้รับอนุญาตให้อ่านบทบาท",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "คุณไม่ได้รับอนุญาตให้แสดงรายการบทบาท",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "คุณไม่ได้รับอนุญาตให้รับข้อมูลบทบาท",
		TOO_MANY_ROLES: "องค์กรนี้มีบทบาทมากเกินไป",
		INVALID_RESOURCE: "สิทธิ์ที่ระบุมีทรัพยากรที่ไม่ถูกต้อง",
		ROLE_NAME_IS_ALREADY_TAKEN: "ชื่อบทบาทนั้นถูกใช้ไปแล้ว",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "ไม่สามารถลบบทบาทที่กำหนดไว้ล่วงหน้าได้",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"ไม่สามารถลบบทบาทที่มีสมาชิกใช้อยู่ได้ กรุณาย้ายสมาชิกไปยังบทบาทอื่นก่อน",
		INVALID_TEAM_ID: "ID ของทีมมีอักขระที่สงวนไว้",
	},
	tr: {
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
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Davetin alıcısı siz değilsiniz",
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
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
			"Bir rol oluşturmanıza izin verilmiyor",
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
	},
	uk: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"У вас немає прав для створення нової організації",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Ви досягли максимальної кількості організацій",
		ORGANIZATION_ALREADY_EXISTS: "Організація вже існує",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "Цей слаг організації вже зайнятий",
		ORGANIZATION_NOT_FOUND: "Організацію не знайдено",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Користувач не є членом організації",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"У вас немає прав для зміни цієї організації",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"У вас немає прав для видалення цієї організації",
		NO_ACTIVE_ORGANIZATION: "Немає активної організації",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Користувач вже є членом цієї організації",
		MEMBER_NOT_FOUND: "Член організації не знайдений",
		ROLE_NOT_FOUND: "Роль не знайдено",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"У вас немає прав для створення нової команди",
		TEAM_ALREADY_EXISTS: "Команда вже існує",
		TEAM_NOT_FOUND: "Команда не знайдена",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Ви не можете залишити організацію, оскільки є єдиним власником",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Ви не можете залишити організацію без власника",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"У вас немає прав для видалення цього члена організації",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"У вас немає прав для запрошення користувачів до цієї організації",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Користувач вже запрошений до цієї організації",
		INVITATION_NOT_FOUND: "Запрошення не знайдено",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Ви не є отримувачем цього запрошення",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Перед прийняттям або відхиленням запрошення потрібне підтвердження email",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Потрібне підтвердження email для перегляду запрошень",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"У вас немає прав для скасування цього запрошення",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Запросивший користувач більше не є членом організації",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"У вас немає прав для запрошення користувача з такою роллю",
		FAILED_TO_RETRIEVE_INVITATION: "Не вдалося отримати запрошення",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Ви досягли максимальної кількості команд",
		UNABLE_TO_REMOVE_LAST_TEAM:
			"Недійсний запит: неможливо видалити останню команду",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"У вас немає прав для зміни цього члена організації",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Досягнуто ліміту членів організації",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"У вас немає прав для створення команд у цій організації",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"У вас нет прав для видалення команд у цій організації",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"У вас немає прав для зміни цієї команди",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
			"У вас немає прав для видалення цієї команди",
		INVITATION_LIMIT_REACHED: "Досягнуто ліміту запрошень",
		TEAM_MEMBER_LIMIT_REACHED: "Досягнуто ліміту учасників команди",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Користувач не є членом команди",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"У вас немає прав для перегляду списку учасників цієї команди",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "У вас немає активної команди",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"У вас немає прав для додавання нового учасника",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"У вас немає прав для видалення учасника команди",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"У вас немає прав доступу до цієї організації на правах власника",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Ви не є членом цієї організації",
		MISSING_AC_INSTANCE:
			"Динамічний контроль доступу вимагає наявності зумовленого інстансу ac в плагіні сервера",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Ви повинні перебувати в організації, щоб створити роль",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "У вас немає прав для створення ролі",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "У вас немає прав для зміни ролі",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "У вас немає прав для видалення ролі",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "У вас немає прав для читання ролі",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"У вас немає прав для перегляду списку ролей",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "У вас немає прав для отримання ролі",
		TOO_MANY_ROLES: "В цій організації занадто багато ролей",
		INVALID_RESOURCE: "Вказаний дозвіл містить неприпустимий ресурс",
		ROLE_NAME_IS_ALREADY_TAKEN: "Ця назва ролі вже зайнята",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Неможливо видалити зумовлену роль",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Неможливо видалити роль, призначену користувачам. Спочатку перепризначте користувачів на іншу роль",
		INVALID_TEAM_ID: "ID команди містить зарезервований символ",
	},
	vi: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
			"Bạn không được phép tạo tổ chức mới",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"Bạn đã đạt số lượng tổ chức tối đa",
		ORGANIZATION_ALREADY_EXISTS: "Tổ chức đã tồn tại",
		ORGANIZATION_SLUG_ALREADY_TAKEN:
			"Đường dẫn thu gọn của tổ chức đã được sử dụng",
		ORGANIZATION_NOT_FOUND: "Không tìm thấy tổ chức",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
			"Người dùng không phải thành viên của tổ chức",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
			"Bạn không được phép cập nhật tổ chức này",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
			"Bạn không được phép xóa tổ chức này",
		NO_ACTIVE_ORGANIZATION: "Không có tổ chức nào đang hoạt động",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
			"Người dùng đã là thành viên của tổ chức này",
		MEMBER_NOT_FOUND: "Không tìm thấy thành viên",
		ROLE_NOT_FOUND: "Không tìm thấy vai trò",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
			"Bạn không được phép tạo nhóm mới",
		TEAM_ALREADY_EXISTS: "Nhóm đã tồn tại",
		TEAM_NOT_FOUND: "Không tìm thấy nhóm",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"Bạn không thể rời tổ chức khi là chủ sở hữu duy nhất",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"Bạn không thể rời tổ chức mà không có chủ sở hữu",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
			"Bạn không được phép xóa thành viên này",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"Bạn không được phép mời người dùng vào tổ chức này",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
			"Người dùng đã được mời vào tổ chức này",
		INVITATION_NOT_FOUND: "Không tìm thấy lời mời",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
			"Bạn không phải người nhận lời mời này",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"Cần xác thực email trước khi chấp nhận hoặc từ chối lời mời",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"Cần xác thực email để xem các lời mời",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
			"Bạn không được phép hủy lời mời này",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"Người mời không còn là thành viên của tổ chức",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"Bạn không được phép mời người dùng với vai trò này",
		FAILED_TO_RETRIEVE_INVITATION: "Lấy thông tin lời mời thất bại",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
			"Bạn đã đạt số lượng nhóm tối đa",
		UNABLE_TO_REMOVE_LAST_TEAM: "Không thể xóa nhóm cuối cùng",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
			"Bạn không được phép cập nhật thành viên này",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
			"Đạt giới hạn số thành viên của tổ chức",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"Bạn không được phép tạo nhóm trong tổ chức này",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"Bạn không được phép xóa nhóm trong tổ chức này",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
			"Bạn không được phép cập nhật nhóm này",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "Bạn không được phép xóa nhóm này",
		INVITATION_LIMIT_REACHED: "Đạt giới hạn số lời mời",
		TEAM_MEMBER_LIMIT_REACHED: "Đạt giới hạn số thành viên nhóm",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Người dùng không phải thành viên nhóm",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
			"Bạn không được xem danh sách thành viên nhóm này",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Bạn không có nhóm nào đang hoạt động",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
			"Bạn không được phép tạo thành viên mới",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
			"Bạn không được phép xóa thành viên nhóm",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"Bạn không được phép truy cập tổ chức này với tư cách chủ sở hữu",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
			"Bạn không phải thành viên của tổ chức này",
		MISSING_AC_INSTANCE:
			"Kiểm soát truy cập động yêu cầu phiên bản ac được định nghĩa trước trên plugin máy chủ",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"Bạn phải ở trong tổ chức để tạo vai trò",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "Bạn không được phép tạo vai trò",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
			"Bạn không được phép cập nhật vai trò",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "Bạn không được phép xóa vai trò",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
			"Bạn không được phép đọc thông tin vai trò",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
			"Bạn không được phép liệt kê các vai trò",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
			"Bạn không được phép lấy thông tin vai trò",
		TOO_MANY_ROLES: "Tổ chức này có quá nhiều vai trò",
		INVALID_RESOURCE: "Quyền hạn được cung cấp bao gồm tài nguyên không hợp lệ",
		ROLE_NAME_IS_ALREADY_TAKEN: "Tên vai trò này đã được sử dụng",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE:
			"Không thể xóa vai trò được định nghĩa trước",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"Không thể xóa vai trò đã được gán cho các thành viên. Hãy gán vai trò khác cho thành viên trước",
		INVALID_TEAM_ID: "ID của nhóm chứa ký tự dự phòng",
	},
	zh: {
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION: "你无权创建新组织",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
			"你已达到组织数量的最大上限",
		ORGANIZATION_ALREADY_EXISTS: "组织已存在",
		ORGANIZATION_SLUG_ALREADY_TAKEN: "组织标识已被占用",
		ORGANIZATION_NOT_FOUND: "找不到该组织",
		USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "该用户不是组织的成员",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "你无权更新此组织",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION: "你无权删除此组织",
		NO_ACTIVE_ORGANIZATION: "当前没有活跃的组织",
		USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "该用户已经是该组织的成员",
		MEMBER_NOT_FOUND: "找不到该成员",
		ROLE_NOT_FOUND: "找不到该角色",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM: "你无权创建新团队",
		TEAM_ALREADY_EXISTS: "团队已存在",
		TEAM_NOT_FOUND: "找不到该团队",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
			"你是该组织唯一的拥有者，不能直接退出组织",
		YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
			"组织必须拥有所有者，你不能在没有其他所有者的情况下退出",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "你无权删除该成员",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
			"你无权邀请用户加入此组织",
		USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "该用户已被邀请加入此组织",
		INVITATION_NOT_FOUND: "找不到该邀请",
		YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "你不是该邀请的接收者",
		EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
			"接受或拒绝邀请前需要验证电子邮箱",
		EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
			"需要验证电子邮箱以查看该会话账户的邀请列表",
		YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION: "你无权取消此邀请",
		INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
			"邀请人已不再是该组织的成员",
		YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
			"你无权邀请该角色级别的用户",
		FAILED_TO_RETRIEVE_INVITATION: "获取邀请信息失败",
		YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS: "你已达到团队数量的最大上限",
		UNABLE_TO_REMOVE_LAST_TEAM: "无法删除最后一个团队",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "你无权修改该成员",
		ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "已达到该组织成员人数的最高上限",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
			"你无权在此组织下创建团队",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
			"你无权在此组织下删除团队",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM: "你无权修改此团队",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM: "你无权删除此团队",
		INVITATION_LIMIT_REACHED: "已达到邀请人数上限",
		TEAM_MEMBER_LIMIT_REACHED: "已达到团队成员上限",
		USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "该用户不是团队成员",
		YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM: "你无权查看此团队的成员列表",
		YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "你当前没有活跃的团队",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER: "你无权创建新的成员",
		YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER: "你无权删除团队成员",
		YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
			"你无权以拥有者身份访问此组织",
		YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "你不是该组织的成员",
		MISSING_AC_INSTANCE: "动态权限控制要求在服务器 Auth 插件上预先配置 ac 实例",
		YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
			"你必须处于一个组织内才能创建角色",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "你无权创建角色",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "你无权更新角色",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "你无权删除角色",
		YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "你无权读取角色",
		YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "你无权列出角色",
		YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "你无权获取角色",
		TOO_MANY_ROLES: "该组织的自定义角色过多",
		INVALID_RESOURCE: "提供的权限声明中包含无效的资源属性",
		ROLE_NAME_IS_ALREADY_TAKEN: "该角色名称已被使用",
		CANNOT_DELETE_A_PRE_DEFINED_ROLE: "不能删除系统预设的默认角色",
		ROLE_IS_ASSIGNED_TO_MEMBERS:
			"无法删除已分配给成员的角色。请先将这些成员重新分配给其他角色",
		INVALID_TEAM_ID: "团队 ID 包含保留的非法字符",
	},
};
