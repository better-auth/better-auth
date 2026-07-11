import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { PluginErrorTranslations } from "../../types";

export const adminTranslations: PluginErrorTranslations<
	typeof ADMIN_ERROR_CODES
> = {
	ar: {
		FAILED_TO_CREATE_USER: "فشل في إنشاء المستخدم",
		USER_ALREADY_EXISTS: "المستخدم موجود بالفعل.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"المستخدم موجود بالفعل. استخدم بريدًا إلكترونيًا آخر.",
		YOU_CANNOT_BAN_YOURSELF: "لا يمكنك حظر نفسك",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"غير مسموح لك بتغيير دور المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "غير مسموح لك بإنشاء مستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "غير مسموح لك بعرض قائمة المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"غير مسموح لك بعرض جلسات المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "غير مسموح لك بحظر المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"غير مسموح لك بانتحال صفة المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"غير مسموح لك بإلغاء جلسات المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "غير مسموح لك بحذف المستخدمين",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"غير مسموح لك بتعيين كلمة مرور المستخدمين",
		BANNED_USER: "لقد تم حظرك من هذا التطبيق",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "غير مسموح لك بالحصول على بيانات المستخدم",
		NO_DATA_TO_UPDATE: "لا توجد بيانات لتحديثها",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "غير مسموح لك بتحديث المستخدمين",
		YOU_CANNOT_REMOVE_YOURSELF: "لا يمكنك إزالة نفسك",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"غير مسموح لك بتعيين قيمة دور غير موجودة",
		YOU_CANNOT_IMPERSONATE_ADMINS: "لا يمكنك انتحال صفة المسؤولين",
		INVALID_ROLE_TYPE: "نوع الدور غير صالح",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"غير مسموح لك بتحديث البريد الإلكتروني للمستخدمين",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"لا يمكن تحديث كلمة المرور عبر تحديث المستخدم. استخدم نقطة نهاية تعيين كلمة مرور المستخدم بدلاً من ذلك",
	},
	bn: {
		FAILED_TO_CREATE_USER: "ব্যবহারকারী তৈরি করতে ব্যর্থ",
		USER_ALREADY_EXISTS: "ব্যবহারকারী ইতিমধ্যে বিদ্যমান।",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"ব্যবহারকারী ইতিমধ্যে বিদ্যমান। অন্য ইমেল ব্যবহার করুন।",
		YOU_CANNOT_BAN_YOURSELF: "আপনি নিজেকে নিষিদ্ধ করতে পারবেন না",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"আপনাকে ব্যবহারকারীদের ভূমিকা পরিবর্তন করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"আপনাকে ব্যবহারকারী তৈরি করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"আপনাকে ব্যবহারকারীদের তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"আপনাকে ব্যবহারকারীদের সেশন তালিকাভুক্ত করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"আপনাকে ব্যবহারকারীদের নিষিদ্ধ করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"আপনাকে ব্যবহারকারীদের ছদ্মবেশ ধারণ করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"আপনাকে ব্যবহারকারীদের সেশন প্রত্যাহার করার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"আপনাকে ব্যবহারকারীদের মুছে ফেলার অনুমতি দেওয়া হয়নি",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"আপনাকে ব্যবহারকারীদের পাসওয়ার্ড সেট করার অনুমতি দেওয়া হয়নি",
		BANNED_USER: "আপনাকে এই অ্যাপ্লিকেশন থেকে নিষিদ্ধ করা হয়েছে",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "আপনাকে ব্যবহারকারী পাওয়ার অনুমতি দেওয়া হয়নি",
		NO_DATA_TO_UPDATE: "আপডেট করার জন্য কোনো তথ্য নেই",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"আপনাকে ব্যবহারকারীদের আপডেট করার অনুমতি দেওয়া হয়নি",
		YOU_CANNOT_REMOVE_YOURSELF: "আপনি নিজেকে সরাতে পারবেন না",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"আপনাকে অস্তিত্বহীন ভূমিকা মান সেট করার অনুমতি দেওয়া হয়নি",
		YOU_CANNOT_IMPERSONATE_ADMINS: "আপনি অ্যাডমিনদের ছদ্মবেশ ধারণ করতে পারবেন না",
		INVALID_ROLE_TYPE: "অবৈধ ভূমিকা প্রকার",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"আপনাকে ব্যবহারকারীদের ইমেল আপডেট করার অনুমতি দেওয়া হয়নি",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"আপডেট-ইউজারের মাধ্যমে পাসওয়ার্ড আপডেট করা যাবে না। পরিবর্তে সেট-ইউজার-পাসওয়ার্ড এন্ডপয়েন্ট ব্যবহার করুন",
	},
	de: {
		FAILED_TO_CREATE_USER: "Benutzer konnte nicht erstellt werden",
		USER_ALREADY_EXISTS: "Benutzer existiert bereits.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Benutzer existiert bereits. Bitte verwenden Sie eine andere E-Mail-Adresse.",
		YOU_CANNOT_BAN_YOURSELF: "Sie können sich nicht selbst sperren",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Sie sind nicht berechtigt, die Rolle des Benutzers zu ändern",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Sie sind nicht berechtigt, Benutzer zu erstellen",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Sie sind nicht berechtigt, Benutzer aufzulisten",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Sie sind nicht berechtigt, Benutzersitzungen aufzulisten",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Sie sind nicht berechtigt, Benutzer zu sperren",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Sie sind nicht berechtigt, die Identität von Benutzern anzunehmen",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Sie sind nicht berechtigt, Benutzersitzungen zu widerrufen",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Sie sind nicht berechtigt, Benutzer zu löschen",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Sie sind nicht berechtigt, das Passwort von Benutzern festzulegen",
		BANNED_USER: "Sie wurden aus dieser Anwendung gesperrt",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Sie sind nicht berechtigt, den Benutzer abzurufen",
		NO_DATA_TO_UPDATE: "Keine Daten zum Aktualisieren vorhanden",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Sie sind nicht berechtigt, Benutzer zu aktualisieren",
		YOU_CANNOT_REMOVE_YOURSELF: "Sie können sich nicht selbst entfernen",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Sie sind nicht berechtigt, einen nicht existierenden Rollenwert festzulegen",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Sie können keine Administratoren imitieren",
		INVALID_ROLE_TYPE: "Ungültiger Rollentyp",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Sie sind nicht berechtigt, die E-Mail-Adresse von Benutzern zu aktualisieren",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Das Passwort kann nicht über Benutzer aktualisieren geändert werden. Verwenden Sie stattdessen den Endpunkt set-user-password",
	},
	en: {
		FAILED_TO_CREATE_USER: "Failed to create user",
		USER_ALREADY_EXISTS: "User already exists.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"User already exists. Use another email.",
		YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"You are not allowed to change users role",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"You are not allowed to list users sessions",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"You are not allowed to impersonate users",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"You are not allowed to revoke users sessions",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"You are not allowed to set users password",
		BANNED_USER: "You have been banned from this application",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user",
		NO_DATA_TO_UPDATE: "No data to update",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users",
		YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"You are not allowed to set a non-existent role value",
		YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins",
		INVALID_ROLE_TYPE: "Invalid role type",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"You are not allowed to update users email",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Password cannot be updated through update-user. Use the set-user-password endpoint instead",
	},
	es: {
		FAILED_TO_CREATE_USER: "Error al crear el usuario",
		USER_ALREADY_EXISTS: "El usuario ya existe.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"El usuario ya existe. Utiliza otro correo electrónico.",
		YOU_CANNOT_BAN_YOURSELF: "No puedes expulsarte a ti mismo",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"No tienes permitido cambiar el rol de los usuarios",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "No tienes permitido crear usuarios",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "No tienes permitido listar usuarios",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"No tienes permitido listar las sesiones de los usuarios",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "No tienes permitido expulsar usuarios",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"No tienes permitido suplantar usuarios",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"No tienes permitido revocar sesiones de usuarios",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"No tienes permitido eliminar usuarios",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"No tienes permitido establecer la contraseña de los usuarios",
		BANNED_USER: "Has sido expulsado de esta aplicación",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "No tienes permitido obtener el usuario",
		NO_DATA_TO_UPDATE: "No hay datos para actualizar",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"No tienes permitido actualizar usuarios",
		YOU_CANNOT_REMOVE_YOURSELF: "No puedes eliminarte a ti mismo",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"No tienes permitido establecer un valor de rol inexistente",
		YOU_CANNOT_IMPERSONATE_ADMINS: "No puedes suplantar a administradores",
		INVALID_ROLE_TYPE: "Tipo de rol inválido",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"No tienes permitido actualizar el correo electrónico de los usuarios",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"La contraseña no se puede actualizar a través de actualizar usuario. Utiliza el punto de acceso set-user-password en su lugar",
	},
	fa: {
		FAILED_TO_CREATE_USER: "خطا در ایجاد کاربر",
		USER_ALREADY_EXISTS: "کاربر از قبل وجود دارد.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"کاربر از قبل وجود دارد. از ایمیل دیگری استفاده کنید.",
		YOU_CANNOT_BAN_YOURSELF: "شما نمی‌توانید خودتان را مسدود کنید",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"شما مجاز به تغییر نقش کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "شما مجاز به ایجاد کاربر نیستید",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "شما مجاز به مشاهده لیست کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"شما مجاز به مشاهده جلسات کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "شما مجاز به مسدود کردن کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"شما مجاز به انتحال هویت کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"شما مجاز به ابطال جلسات کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "شما مجاز به حذف کاربران نیستید",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"شما مجاز به تنظیم رمز عبور کاربران نیستید",
		BANNED_USER: "شما از این برنامه مسدود شده‌اید",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "شما مجاز به دریافت اطلاعات کاربر نیستید",
		NO_DATA_TO_UPDATE: "داده‌ای برای به‌روزرسانی وجود ندارد",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"شما مجاز به به‌روزرسانی کاربران نیستید",
		YOU_CANNOT_REMOVE_YOURSELF: "شما نمی‌توانید خودتان را حذف کنید",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"شما مجاز به تعیین مقدار نقش غیرموجود نیستید",
		YOU_CANNOT_IMPERSONATE_ADMINS: "شما نمی‌توانید هویت مدیران را انتحال کنید",
		INVALID_ROLE_TYPE: "نوع نقش نامعتبر است",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"شما مجاز به به‌روزرسانی ایمیل کاربران نیستید",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"رمز عبور از طریق به‌روزرسانی کاربر قابل به‌روزرسانی نیست. به جای آن از نقطه پایانی تنظیم رمز عبور کاربر استفاده کنید",
	},
	fr: {
		FAILED_TO_CREATE_USER: "Échec de la création de l'utilisateur",
		USER_ALREADY_EXISTS: "L'utilisateur existe déjà.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"L'utilisateur existe déjà. Utilisez une autre adresse e-mail.",
		YOU_CANNOT_BAN_YOURSELF: "Vous ne pouvez pas vous bannir vous-même",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Vous n'êtes pas autorisé à modifier le rôle des utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Vous n'êtes pas autorisé à créer des utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Vous n'êtes pas autorisé à lister les utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Vous n'êtes pas autorisé à lister les sessions des utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Vous n'êtes pas autorisé à bannir des utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Vous n'êtes pas autorisé à usurper l'identité d'utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Vous n'êtes pas autorisé à révoquer les sessions des utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Vous n'êtes pas autorisé à supprimer des utilisateurs",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Vous n'êtes pas autorisé à définir le mot de passe des utilisateurs",
		BANNED_USER: "Vous avez été banni de cette application",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Vous n'êtes pas autorisé à obtenir l'utilisateur",
		NO_DATA_TO_UPDATE: "Aucune donnée à mettre à jour",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Vous n'êtes pas autorisé à mettre à jour des utilisateurs",
		YOU_CANNOT_REMOVE_YOURSELF: "Vous ne pouvez pas vous retirer vous-même",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Vous n'êtes pas autorisé à définir une valeur de rôle inexistante",
		YOU_CANNOT_IMPERSONATE_ADMINS:
			"Vous ne pouvez pas usurper l'identité d'administrateurs",
		INVALID_ROLE_TYPE: "Type de rôle invalide",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Vous n'êtes pas autorisé à mettre à jour l'e-mail des utilisateurs",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Le mot de passe ne peut pas être mis à jour via l'e-mail ou les informations de l'utilisateur. Utilisez plutôt l'API de modification de mot de passe",
	},
	hi: {
		FAILED_TO_CREATE_USER: "उपयोगकर्ता बनाने में विफल",
		USER_ALREADY_EXISTS: "उपयोगकर्ता पहले से मौजूद है।",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"उपयोगकर्ता पहले से मौजूद है। किसी अन्य ईमेल का उपयोग करें।",
		YOU_CANNOT_BAN_YOURSELF: "आप स्वयं को प्रतिबंधित नहीं कर सकते",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"आपको उपयोगकर्ताओं की भूमिका बदलने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "आपको उपयोगकर्ता बनाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"आपको उपयोगकर्ताओं को सूचीबद्ध करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"आपको उपयोगकर्ता सत्रों को सूचीबद्ध करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"आपको उपयोगकर्ताओं को प्रतिबंधित करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"आपको उपयोगकर्ताओं का स्वांग रचने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"आपको उपयोगकर्ता सत्रों को रद्द करने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"आपको उपयोगकर्ताओं को हटाने की अनुमति नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"आपको उपयोगकर्ताओं का पासवर्ड सेट करने की अनुमति नहीं है",
		BANNED_USER: "आपको इस एप्लिकेशन से प्रतिबंधित कर दिया गया है",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "आपको उपयोगकर्ता प्राप्त करने की अनुमति नहीं है",
		NO_DATA_TO_UPDATE: "अपडेट करने के लिए कोई डेटा नहीं है",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"आपको उपयोगकर्ताओं को अपडेट करने की अनुमति नहीं है",
		YOU_CANNOT_REMOVE_YOURSELF: "आप स्वयं को हटा नहीं सकते",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"आपको अस्तित्वहीन भूमिका मान सेट करने की अनुमति नहीं है",
		YOU_CANNOT_IMPERSONATE_ADMINS: "आप प्रशासकों का स्वांग नहीं रच सकते",
		INVALID_ROLE_TYPE: "अमान्य भूमिका प्रकार",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"आपको उपयोगकर्ताओं का ईमेल अपडेट करने की अनुमति नहीं है",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"उपयोगकर्ता अपडेट के माध्यम से पासवर्ड अपडेट नहीं किया जा सकता है। इसके बजाय सेट-यूज़र-पासवर्ड एंडपॉइंट का उपयोग करें",
	},
	id: {
		FAILED_TO_CREATE_USER: "Gagal membuat pengguna",
		USER_ALREADY_EXISTS: "Pengguna sudah ada.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Pengguna sudah ada. Gunakan email lain.",
		YOU_CANNOT_BAN_YOURSELF: "Anda tidak dapat memblokir diri sendiri",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Anda tidak diizinkan untuk mengubah peran pengguna",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Anda tidak diizinkan untuk membuat pengguna",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Anda tidak diizinkan untuk melihat daftar pengguna",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Anda tidak diizinkan untuk melihat daftar sesi pengguna",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Anda tidak diizinkan untuk memblokir pengguna",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Anda tidak diizinkan untuk meniru pengguna",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Anda tidak diizinkan untuk mencabut sesi pengguna",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Anda tidak diizinkan untuk menghapus pengguna",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Anda tidak diizinkan untuk mengatur kata sandi pengguna",
		BANNED_USER: "Anda telah diblokir dari aplikasi ini",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Anda tidak diizinkan untuk mendapatkan pengguna",
		NO_DATA_TO_UPDATE: "Tidak ada data untuk diperbarui",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Anda tidak diizinkan untuk memperbarui pengguna",
		YOU_CANNOT_REMOVE_YOURSELF: "Anda tidak dapat menghapus diri sendiri",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Anda tidak diizinkan untuk menetapkan nilai peran yang tidak ada",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Anda tidak dapat meniru admin",
		INVALID_ROLE_TYPE: "Jenis peran tidak valid",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Anda tidak diizinkan untuk memperbarui email pengguna",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Kata sandi tidak dapat diperbarui melalui perbarui pengguna. Gunakan endpoint set-user-password sebagai gantinya",
	},
	it: {
		FAILED_TO_CREATE_USER: "Impossibile creare l'utente",
		USER_ALREADY_EXISTS: "L'utente esiste già.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"L'utente esiste già. Utilizza un'altra e-mail.",
		YOU_CANNOT_BAN_YOURSELF: "Non puoi bandire te stesso",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Non sei autorizzato a modificare il ruolo degli utenti",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Non sei autorizzato a creare utenti",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Non sei autorizzato a elencare gli utenti",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Non sei autorizzato a elencare le sessioni degli utenti",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Non sei autorizzato a bandire gli utenti",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Non sei autorizzato a impersonare gli utenti",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Non sei autorizzato a revocare le sessioni degli utenti",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Non sei autorizzato a eliminare gli utenti",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Non sei autorizzato a impostare la password degli utenti",
		BANNED_USER: "Sei stato bandito da questa applicazione",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "Non sei autorizzato a ottenere l'utente",
		NO_DATA_TO_UPDATE: "Nessun dato da aggiornare",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Non sei autorizzato ad aggiornare gli utenti",
		YOU_CANNOT_REMOVE_YOURSELF: "Non puoi rimuovere te stesso",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Non sei autorizzato a impostare un valore di ruolo non esistente",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Non puoi impersonare gli amministratori",
		INVALID_ROLE_TYPE: "Tipo di ruolo non valido",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Non sei autorizzato ad aggiornare l'e-mail degli utenti",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"La password non può essere aggiornata tramite l'aggiornamento dell'utente. Utilizza invece l'endpoint set-user-password",
	},
	ja: {
		FAILED_TO_CREATE_USER: "ユーザーの作成に失敗しました",
		USER_ALREADY_EXISTS: "ユーザーはすでに存在します。",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"ユーザーはすでに存在します。別のメールアドレスを使用してください。",
		YOU_CANNOT_BAN_YOURSELF: "自分自身を禁止することはできません",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"ユーザーの役割を変更することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"ユーザーを作成することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"ユーザーを一覧表示することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"ユーザーのセッションを一覧表示することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"ユーザーを禁止することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"ユーザーになりすますことは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"ユーザーのセッションを破棄することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"ユーザーを削除することは許可されていません",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"ユーザーのパスワードを設定することは許可されていません",
		BANNED_USER: "このアプリケーションから禁止されました",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "ユーザーの取得は許可されていません",
		NO_DATA_TO_UPDATE: "更新するデータがありません",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"ユーザーを更新することは許可されていません",
		YOU_CANNOT_REMOVE_YOURSELF: "自分自身を削除することはできません",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"存在しない役割の値を設定することは許可されていません",
		YOU_CANNOT_IMPERSONATE_ADMINS: "管理者のなりすましはできません",
		INVALID_ROLE_TYPE: "無効な役割タイプ",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"ユーザーのメールアドレスを更新することは許可されていません",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"ユーザーの更新を通じてパスワードを更新することはできません。代わりに set-user-password エンドポイントを使用してください",
	},
	ko: {
		FAILED_TO_CREATE_USER: "사용자 생성에 실패했습니다",
		USER_ALREADY_EXISTS: "사용자가 이미 존재합니다.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"사용자가 이미 존재합니다. 다른 이메일을 사용하세요.",
		YOU_CANNOT_BAN_YOURSELF: "자신을 차단할 수 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"사용자 역할을 변경할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "사용자를 생성할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "사용자를 목록화할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"사용자 세션을 목록화할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "사용자를 차단할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "사용자를 가장할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"사용자 세션을 해제할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "사용자를 삭제할 권한이 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"사용자 비밀번호를 설정할 권한이 없습니다",
		BANNED_USER: "이 애플리케이션에서 차단되었습니다",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "사용자를 가져올 권한이 없습니다",
		NO_DATA_TO_UPDATE: "업데이트할 데이터가 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "사용자를 업데이트할 권한이 없습니다",
		YOU_CANNOT_REMOVE_YOURSELF: "자신을 삭제할 수 없습니다",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"존재하지 않는 역할 값을 설정할 권한이 없습니다",
		YOU_CANNOT_IMPERSONATE_ADMINS: "관리자를 가장할 수 없습니다",
		INVALID_ROLE_TYPE: "유효하지 않은 역할 유형",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"사용자 이메일을 업데이트할 권한이 없습니다",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"사용자 업데이트를 통해 비밀번호를 변경할 수 없습니다. 대신 set-user-password 엔드포인트를 사용하세요",
	},
	nl: {
		FAILED_TO_CREATE_USER: "Mislukt om gebruiker aan te maken",
		USER_ALREADY_EXISTS: "Gebruiker bestaat al.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Gebruiker bestaat al. Gebruik een ander e-mailadres.",
		YOU_CANNOT_BAN_YOURSELF: "Je kunt jezelf niet verbannen",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Je bent niet gemachtigd om de rol van gebruikers te wijzigen",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Je bent niet gemachtigd om gebruikers aan te maken",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Je bent niet gemachtigd om gebruikers te tonen",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Je bent niet gemachtigd om gebruikerssessies te tonen",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Je bent niet gemachtigd om gebruikers te verbannen",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Je bent niet gemachtigd om de identiteit van gebruikers aan te nemen",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Je bent niet gemachtigd om gebruikerssessies in te trekken",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Je bent niet gemachtigd om gebruikers te verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Je bent niet gemachtigd om het wachtwoord van gebruikers in te stellen",
		BANNED_USER: "Je bent verbannen uit deze applicatie",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Je bent niet gemachtigd om de gebruiker op te halen",
		NO_DATA_TO_UPDATE: "Geen gegevens om bij te werken",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Je bent niet gemachtigd om gebruikers bij te werken",
		YOU_CANNOT_REMOVE_YOURSELF: "Je kunt jezelf niet verwijderen",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Je bent niet gemachtigd om een niet-bestaande rolwaarde in te stellen",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Je kunt geen admins imiteren",
		INVALID_ROLE_TYPE: "Ongeldig roltype",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Je bent niet gemachtigd om het e-mailadres van gebruikers bij te werken",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Wachtwoord kan niet worden bijgewerkt via update-user. Gebruik in plaats daarvan het endpoint set-user-password",
	},
	pl: {
		FAILED_TO_CREATE_USER: "Nie udało się utworzyć użytkownika",
		USER_ALREADY_EXISTS: "Użytkownik już istnieje.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Użytkownik już istnieje. Użyj innego adresu e-mail.",
		YOU_CANNOT_BAN_YOURSELF: "Nie możesz zablokować samego siebie",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Nie masz uprawnień do zmiany roli użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Nie masz uprawnień do tworzenia użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Nie masz uprawnień do wyświetlania listy użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Nie masz uprawnień do wyświetlania sesji użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Nie masz uprawnień do blokowania użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Nie masz uprawnień do podszywania się pod użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Nie masz uprawnień do unieważniania sesji użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Nie masz uprawnień do usuwania użytkowników",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Nie masz uprawnień do ustawiania hasła użytkowników",
		BANNED_USER: "Zostałeś zablokowany w tej aplikacji",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Nie masz uprawnień do pobierania użytkownika",
		NO_DATA_TO_UPDATE: "Brak danych do aktualizacji",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Nie masz uprawnień do aktualizowania użytkowników",
		YOU_CANNOT_REMOVE_YOURSELF: "Nie możesz usunąć samego siebie",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Nie masz uprawnień do ustawiania nieistniejącej roli",
		YOU_CANNOT_IMPERSONATE_ADMINS:
			"Nie możesz podszywać się pod administratorów",
		INVALID_ROLE_TYPE: "Nieprawidłowy typ roli",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Nie masz uprawnień do aktualizowania adresu e-mail użytkowników",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Hasło nie może być aktualizowane przez aktualizację użytkownika. Użyj zamiast tego punktu końcowego set-user-password",
	},
	pt: {
		FAILED_TO_CREATE_USER: "Falha ao criar usuário",
		USER_ALREADY_EXISTS: "Usuário já existe.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Usuário já existe. Use outro e-mail.",
		YOU_CANNOT_BAN_YOURSELF: "Você não pode banir a si mesmo",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Você não tem permissão para alterar a função dos usuários",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Você não tem permissão para criar usuários",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Você não tem permissão para listar usuários",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Você não tem permissão para listar sessões de usuários",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Você não tem permissão para banir usuários",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Você não tem permissão para personificar usuários",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Você não tem permissão para revogar sessões de usuários",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Você não tem permissão para excluir usuários",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Você não tem permissão para definir a senha dos usuários",
		BANNED_USER: "Você foi banido desta aplicação",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Você não tem permissão para obter usuário",
		NO_DATA_TO_UPDATE: "Nenhum dado para atualizar",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Você não tem permissão para atualizar usuários",
		YOU_CANNOT_REMOVE_YOURSELF: "Você não pode remover a si mesmo",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Você não tem permissão para definir um valor de função inexistente",
		YOU_CANNOT_IMPERSONATE_ADMINS:
			"Você não pode se passar por administradores",
		INVALID_ROLE_TYPE: "Tipo de função inválido",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Você não tem permissão para atualizar o e-mail dos usuários",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"A senha não pode ser atualizada através da atualização de usuário. Use o ponto de extremidade set-user-password",
	},
	ru: {
		FAILED_TO_CREATE_USER: "Не удалось создать пользователя",
		USER_ALREADY_EXISTS: "Пользователь уже существует.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Пользователь уже существует. Используйте другой email.",
		YOU_CANNOT_BAN_YOURSELF: "Вы не можете заблокировать себя",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"У вас нет прав для изменения роли пользователей",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"У вас нет прав для создания пользователей",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"У вас нет прав для просмотра списка пользователей",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"У вас нет прав для просмотра списка сессий пользователей",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"У вас нет прав для блокировки пользователей",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"У вас нет прав для имитации пользователей",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"У вас нет прав для отзыва сессий пользователей",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"У вас нет прав для удаления пользователей",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"У вас нет прав для изменения пароля пользователей",
		BANNED_USER: "Вы были заблокированы в этом приложении",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"У вас нет прав для получения пользователя",
		NO_DATA_TO_UPDATE: "Нет данных для обновления",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"У вас нет прав для обновления данных пользователей",
		YOU_CANNOT_REMOVE_YOURSELF: "Вы не можете удалить себя",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"У вас нет прав для установки несуществующей роли",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Вы не можете имитировать администраторов",
		INVALID_ROLE_TYPE: "Недопустимый тип роли",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"У вас нет прав для изменения email пользователей",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Пароль нельзя обновить через обновление пользователя. Используйте для этого эндпоинт set-user-password",
	},
	sv: {
		FAILED_TO_CREATE_USER: "Det gick inte att skapa användare",
		USER_ALREADY_EXISTS: "Användaren finns redan.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Användaren finns redan. Använd en annan e-postadress.",
		YOU_CANNOT_BAN_YOURSELF: "Du kan inte stänga av dig själv",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Du har inte tillåtelse att ändra användares roll",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"Du har inte tillåtelse att skapa användare",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Du har inte tillåtelse att lista användare",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Du har inte tillåtelse att lista användares sessioner",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"Du har inte tillåtelse att stänga av användare",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Du har inte tillåtelse att imitera användare",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Du har inte tillåtelse att återkalla användares sessioner",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"Du har inte tillåtelse att ta bort användare",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Du har inte tillåtelse att ange användares lösenord",
		BANNED_USER: "Du har stängts av från denna applikation",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Du har inte tillåtelse att hämta användare",
		NO_DATA_TO_UPDATE: "Det finns ingen data att uppdatera",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Du har inte tillåtelse att uppdatera användare",
		YOU_CANNOT_REMOVE_YOURSELF: "Du kan inte ta bort dig själv",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Du har inte tillåtelse att ange ett rollvärde som inte existerar",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Du kan inte imitera administratörer",
		INVALID_ROLE_TYPE: "Ogiltig rolltyp",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Du har inte tillåtelse att uppdatera användares e-postadress",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Lösenordet kan inte uppdateras via uppdatera användare. Använd endpointen set-user-password istället",
	},
	th: {
		FAILED_TO_CREATE_USER: "สร้างผู้ใช้ไม่สำเร็จ",
		USER_ALREADY_EXISTS: "ผู้ใช้มีอยู่แล้ว",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "ผู้ใช้มีอยู่แล้ว กรุณาใช้อีเมลอื่น",
		YOU_CANNOT_BAN_YOURSELF: "คุณไม่สามารถแบนตัวเองได้",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "คุณไม่ได้รับอนุญาตให้เปลี่ยนบทบาทของผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "คุณไม่ได้รับอนุญาตให้สร้างผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "คุณไม่ได้รับอนุญาตให้แสดงรายการผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"คุณไม่ได้รับอนุญาตให้แสดงรายการเซสชันของผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "คุณไม่ได้รับอนุญาตให้แบนผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "คุณไม่ได้รับอนุญาตให้สวมบทบาทเป็นผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"คุณไม่ได้รับอนุญาตให้เพิกถอนเซสชันของผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "คุณไม่ได้รับอนุญาตให้ลบผู้ใช้",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "คุณไม่ได้รับอนุญาตให้ตั้งรหัสผ่านของผู้ใช้",
		BANNED_USER: "คุณถูกแบนจากแอปพลิเคชันนี้",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "คุณไม่ได้รับอนุญาตให้ดึงข้อมูลผู้ใช้",
		NO_DATA_TO_UPDATE: "ไม่มีข้อมูลสำหรับอัปเดต",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "คุณไม่ได้รับอนุญาตให้อัปเดตผู้ใช้",
		YOU_CANNOT_REMOVE_YOURSELF: "คุณไม่สามารถลบตัวเองออกได้",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"คุณไม่ได้รับอนุญาตให้ตั้งค่าบทบาทที่ไม่มีอยู่จริง",
		YOU_CANNOT_IMPERSONATE_ADMINS: "คุณไม่สามารถสวมบทบาทเป็นผู้ดูแลระบบได้",
		INVALID_ROLE_TYPE: "ประเภทบทบาทไม่ถูกต้อง",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: "คุณไม่ได้รับอนุญาตให้อัปเดตอีเมลของผู้ใช้",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"ไม่สามารถอัปเดตรหัสผ่านผ่านการอัปเดตผู้ใช้ได้ กรุณาใช้จุดปลายทาง set-user-password แทน",
	},
	tr: {
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
	},
	uk: {
		FAILED_TO_CREATE_USER: "Не вдалося створити користувача",
		USER_ALREADY_EXISTS: "Користувач вже існує.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Користувач вже існує. Використовуйте іншу електронну пошту.",
		YOU_CANNOT_BAN_YOURSELF: "Ви не можете заблокувати себе",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"У вас немає прав для зміни ролі користувачів",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
			"У вас немає прав для створення користувачів",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"У вас нет прав для перегляду списку користувачів",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"У вас немає прав для перегляду сесій користувачів",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
			"У вас немає прав для блокування користувачів",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"У вас немає прав для імітації користувачів",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"У вас немає прав для відкликання сесій користувачів",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
			"У вас немає прав для видалення користувачів",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"У вас немає прав для зміни пароля користувачів",
		BANNED_USER: "Вас було заблоковано в цьому додатку",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"У вас немає прав для отримання користувача",
		NO_DATA_TO_UPDATE: "Немає даних для оновлення",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"У вас немає прав для оновлення користувачів",
		YOU_CANNOT_REMOVE_YOURSELF: "Ви не можете видалити себе",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"У вас немає прав для встановлення ролі, якої не існує",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Ви не можете імітувати адміністраторів",
		INVALID_ROLE_TYPE: "Недійсний тип ролі",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"У вас немає прав для зміни електронної пошти користувачів",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Пароль не можна змінити через оновлення користувача. Використовуйте натомість ендпоінт set-user-password",
	},
	vi: {
		FAILED_TO_CREATE_USER: "Tạo người dùng thất bại",
		USER_ALREADY_EXISTS: "Người dùng đã tồn tại.",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
			"Người dùng đã tồn tại. Vui lòng dùng email khác.",
		YOU_CANNOT_BAN_YOURSELF: "Bạn không thể tự cấm chính mình",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
			"Bạn không được phép thay đổi vai trò người dùng",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "Bạn không được phép tạo người dùng",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
			"Bạn không được phép xem danh sách người dùng",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
			"Bạn không được phép xem danh sách phiên của người dùng",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "Bạn không được phép cấm người dùng",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
			"Bạn không được phép mạo danh người dùng",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
			"Bạn không được phép thu hồi phiên của người dùng",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "Bạn không được phép xóa người dùng",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
			"Bạn không được phép đặt mật khẩu người dùng",
		BANNED_USER: "Bạn đã bị cấm khỏi ứng dụng này",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER:
			"Bạn không được phép lấy thông tin người dùng",
		NO_DATA_TO_UPDATE: "Không có dữ liệu nào để cập nhật",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
			"Bạn không được phép cập nhật người dùng",
		YOU_CANNOT_REMOVE_YOURSELF: "Bạn không thể tự xóa chính mình",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
			"Bạn không được phép thiết lập giá trị vai trò không tồn tại",
		YOU_CANNOT_IMPERSONATE_ADMINS: "Bạn không thể mạo danh quản trị viên",
		INVALID_ROLE_TYPE: "Loại vai trò không hợp lệ",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
			"Bạn không được phép cập nhật email của người dùng",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"Mật khẩu không thể cập nhật thông qua cập nhật người dùng. Hãy dùng điểm cuối set-user-password thay thế",
	},
	zh: {
		FAILED_TO_CREATE_USER: "创建用户失败",
		USER_ALREADY_EXISTS: "用户已存在。",
		USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "用户已存在。请使用其他电子邮箱。",
		YOU_CANNOT_BAN_YOURSELF: "你不能封禁你自己",
		YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE: "你无权更改用户角色",
		YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "你无权创建用户",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "你无权列出用户",
		YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS: "你无权列出用户会话",
		YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "你无权封禁用户",
		YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS: "你无权模拟用户",
		YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS: "你无权撤销用户会话",
		YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "你无权删除用户",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD: "你无权设置用户密码",
		BANNED_USER: "你已被该应用程序封禁",
		YOU_ARE_NOT_ALLOWED_TO_GET_USER: "你无权获取用户",
		NO_DATA_TO_UPDATE: "没有数据需要更新",
		YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "你无权更新用户",
		YOU_CANNOT_REMOVE_YOURSELF: "你 cannot remove yourself",
		YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: "你无权设置不存在的角色值",
		YOU_CANNOT_IMPERSONATE_ADMINS: "你不能模拟管理员",
		INVALID_ROLE_TYPE: "无效的角色类型",
		YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL: "你无权更新用户邮箱",
		PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
			"密码不能通过更新用户接口来修改。请改用 set-user-password 接口",
	},
};
