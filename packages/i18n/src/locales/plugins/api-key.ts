import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { ErrorTranslations } from "../../types";

export const apiKeyTranslations: ErrorTranslations<typeof API_KEY_ERROR_CODES> =
	{
		ar: {
			INVALID_METADATA_TYPE:
				"يجب أن تكون البيانات التعريفية كائنًا أو غير محددة",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"مطلوب refillAmount عند توفير refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"مطلوب refillInterval عند توفير refillAmount",
			USER_BANNED: "المستخدم محظور",
			UNAUTHORIZED_SESSION: "جلسة غير مصرح بها أو غير صالحة",
			KEY_NOT_FOUND: "مفتاح API غير موجود",
			KEY_DISABLED: "مفتاح API معطل",
			KEY_EXPIRED: "انتهت صلاحية مفتاح API",
			USAGE_EXCEEDED: "تجاوز مفتاح API حد الاستخدام الخاص به",
			KEY_NOT_RECOVERABLE: "مفتاح API غير قابل للاسترداد",
			EXPIRES_IN_IS_TOO_SMALL:
				"قيمة expiresIn أصغر من الحد الأدنى المحدد مسبقًا.",
			EXPIRES_IN_IS_TOO_LARGE:
				"قيمة expiresIn أكبر من الحد الأقصى المحدد مسبقًا.",
			INVALID_REMAINING: "العدد المتبقي إما كبير جدًا أو صغير جدًا.",
			INVALID_PREFIX_LENGTH: "طول البادئة إما كبير جدًا أو صغير جدًا.",
			INVALID_NAME_LENGTH: "طول الاسم إما كبير جدًا أو صغير جدًا.",
			METADATA_DISABLED: "البيانات التعريفية معطلة.",
			RATE_LIMIT_EXCEEDED: "تم تجاوز حد المعدل.",
			NO_VALUES_TO_UPDATE: "لا توجد قيم لتحديثها.",
			KEY_DISABLED_EXPIRATION: "قيم انتهاء الصلاحية المخصصة للمفتاح معطلة.",
			INVALID_API_KEY: "مفتاح API غير صالح.",
			INVALID_USER_ID_FROM_API_KEY: "معرف المستخدم من مفتاح API غير صالح.",
			INVALID_REFERENCE_ID_FROM_API_KEY: "معرف المرجع من مفتاح API غير صالح.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"أرجع جالب مفتاح API نوع مفتاح غير صالح. المتوقع سلسلة نصية.",
			SERVER_ONLY_PROPERTY:
				"لا يمكن تعيين الخاصية التي تحاول تعيينها إلا من مثيل مصادقة الخادم فقط.",
			FAILED_TO_UPDATE_API_KEY: "فشل تحديث مفتاح API",
			NAME_REQUIRED: "اسم مفتاح API مطلوب.",
			ORGANIZATION_ID_REQUIRED:
				"معرف المنظمة مطلوب لمفاتيح API المملوكة للمنظمة.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"أنت لست عضوًا في المنظمة التي تمتلك مفتاح API هذا.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"ليس لديك إذن لتنفيذ هذا الإجراء على مفاتيح API الخاصة بالمنظمة.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"لم يتم العثور على تكوين افتراضي لمفتاح API.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"مكون المنظمة مطلوب لمفاتيح API المملوكة للمنظمة. يرجى تثبيت وتهيئة مكون المنظمة.",
		},
		bn: {
			INVALID_METADATA_TYPE: "মেটাডেটা অবশ্যই একটি অবজেক্ট বা অনির্ধারিত হতে হবে",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillInterval প্রদান করা হলে refillAmount প্রয়োজন",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillAmount প্রদান করা হলে refillInterval প্রয়োজন",
			USER_BANNED: "ব্যবহারকারী নিষিদ্ধ",
			UNAUTHORIZED_SESSION: "অননুমোদিত বা অবৈধ সেশন",
			KEY_NOT_FOUND: "API কী পাওয়া যায়নি",
			KEY_DISABLED: "API কী নিষ্ক্রিয় করা হয়েছে",
			KEY_EXPIRED: "API কী এর মেয়াদ শেষ হয়ে গেছে",
			USAGE_EXCEEDED: "API কী এর ব্যবহারের সীমা অতিক্রম করেছে",
			KEY_NOT_RECOVERABLE: "API কী পুনরুদ্ধারযোগ্য নয়",
			EXPIRES_IN_IS_TOO_SMALL: "expiresIn পূর্বনির্ধারিত সর্বনিম্ন মানের চেয়ে ছোট।",
			EXPIRES_IN_IS_TOO_LARGE: "expiresIn পূর্বনির্ধারিত সর্বোচ্চ মানের চেয়ে বড়।",
			INVALID_REMAINING: "অবশিষ্ট সংখ্যাটি হয় খুব বড় বা খুব ছোট।",
			INVALID_PREFIX_LENGTH: "প্রিফিক্স দৈর্ঘ্য হয় খুব বড় বা খুব ছোট।",
			INVALID_NAME_LENGTH: "নামের দৈর্ঘ্য হয় খুব বড় বা খুব ছোট।",
			METADATA_DISABLED: "মেটাডেটা নিষ্ক্রিয় করা হয়েছে।",
			RATE_LIMIT_EXCEEDED: "হারের সীমা অতিক্রম করেছে।",
			NO_VALUES_TO_UPDATE: "আপডেট করার কোনো মান নেই।",
			KEY_DISABLED_EXPIRATION: "কাস্টম কী এর মেয়াদ শেষ হওয়ার মান নিষ্ক্রিয় করা হয়েছে।",
			INVALID_API_KEY: "API কী অবৈধ।",
			INVALID_USER_ID_FROM_API_KEY: "API কী থেকে ব্যবহারকারী আইডি অবৈধ।",
			INVALID_REFERENCE_ID_FROM_API_KEY: "API কী থেকে রেফারেন্স আইডি অবৈধ।",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API কী গেটার একটি অবৈধ কী টাইপ রিটার্ন করেছে। স্ট্রিং প্রত্যাশিত।",
			SERVER_ONLY_PROPERTY:
				"যে প্রপার্টি সেট করার চেষ্টা করছেন তা কেবল সার্ভার অথ ইনস্ট্যান্স থেকে সেট করা সম্ভব।",
			FAILED_TO_UPDATE_API_KEY: "API কী আপডেট করতে ব্যর্থ হয়েছে",
			NAME_REQUIRED: "API কী এর নাম প্রয়োজন।",
			ORGANIZATION_ID_REQUIRED:
				"সংস্থার মালিকানাধীন API কী-এর জন্য সংস্থা আইডি প্রয়োজন।",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"আপনি এই API কী এর মালিকানাধীন সংস্থার সদস্য নন।",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"সংস্থার API কী-তে এই কাজটি করার জন্য আপনার অনুমতি নেই।",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"কোনো ডিফল্ট API কী কনফিগারেশন পাওয়া যায়নি।",
			ORGANIZATION_PLUGIN_REQUIRED:
				"সংস্থার মালিকানাধীন API কী-এর জন্য সংস্থা প্লাগইন প্রয়োজন। অনুগ্রহ করে সংস্থা প্লাগইনটি ইনস্টল এবং কনফিগার করুন।",
		},
		de: {
			INVALID_METADATA_TYPE:
				"Metadaten müssen ein Objekt oder undefiniert sein",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount ist erforderlich, wenn refillInterval angegeben wird",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval ist erforderlich, wenn refillAmount angegeben wird",
			USER_BANNED: "Benutzer ist gesperrt",
			UNAUTHORIZED_SESSION: "Ungültige oder nicht autorisierte Sitzung",
			KEY_NOT_FOUND: "API-Schlüssel nicht gefunden",
			KEY_DISABLED: "API-Schlüssel ist deaktiviert",
			KEY_EXPIRED: "API-Schlüssel ist abgelaufen",
			USAGE_EXCEEDED: "API-Schlüssel hat sein Nutzungslimit erreicht",
			KEY_NOT_RECOVERABLE: "API-Schlüssel ist nicht wiederherstellbar",
			EXPIRES_IN_IS_TOO_SMALL:
				"Der Wert für expiresIn is kleiner als der vordefinierte Mindestwert.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Der Wert für expiresIn is größer als der vordefinierte Höchstwert.",
			INVALID_REMAINING:
				"Die verbleibende Anzahl ist entweder zu groß oder zu klein.",
			INVALID_PREFIX_LENGTH:
				"Die Präfixlänge ist entweder zu groß oder zu klein.",
			INVALID_NAME_LENGTH:
				"Die Namenslänge ist entweder zu groß oder zu klein.",
			METADATA_DISABLED: "Metadaten sind deaktiviert.",
			RATE_LIMIT_EXCEEDED: "Ratenbegrenzung überschritten.",
			NO_VALUES_TO_UPDATE: "Keine Werte zum Aktualisieren.",
			KEY_DISABLED_EXPIRATION:
				"Benutzerdefinierte Werte für den Ablauf des Schlüssels sind deaktiviert.",
			INVALID_API_KEY: "Ungültiger API-Schlüssel.",
			INVALID_USER_ID_FROM_API_KEY:
				"Die Benutzer-ID aus dem API-Schlüssel ist ungültig.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"Die Referenz-ID aus dem API-Schlüssel ist ungültig.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API-Schlüssel-Getter gab einen ungültigen Schlüsseltyp zurück. Zeichenkette erwartet.",
			SERVER_ONLY_PROPERTY:
				"Die Eigenschaft, die Sie festlegen möchten, kann nur von der Server-Auth-Instanz festgelegt werden.",
			FAILED_TO_UPDATE_API_KEY:
				"API-Schlüssel konnte nicht aktualisiert werden",
			NAME_REQUIRED: "Name des API-Schlüssels ist erforderlich.",
			ORGANIZATION_ID_REQUIRED:
				"Die Organisations-ID ist für API-Schlüssel im Besitz einer Organisation erforderlich.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Sie sind kein Mitglied der Organisation, der dieser API-Schlüssel gehört.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Sie haben keine Berechtigung, diese Aktion für Organisations-API-Schlüssel durchzuführen.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Keine Standard-API-Schlüssel-Konfiguration gefunden.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Das Organisations-Plugin ist für API-Schlüssel im Besitz einer Organisation erforderlich. Bitte installieren und konfigurieren Sie das Organisations-Plugin.",
		},
		en: {
			INVALID_METADATA_TYPE: "metadata must be an object or undefined",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount is required when refillInterval is provided",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval is required when refillAmount is provided",
			USER_BANNED: "User is banned",
			UNAUTHORIZED_SESSION: "Unauthorized or invalid session",
			KEY_NOT_FOUND: "API Key not found",
			KEY_DISABLED: "API Key is disabled",
			KEY_EXPIRED: "API Key has expired",
			USAGE_EXCEEDED: "API Key has reached its usage limit",
			KEY_NOT_RECOVERABLE: "API Key is not recoverable",
			EXPIRES_IN_IS_TOO_SMALL:
				"The expiresIn is smaller than the predefined minimum value.",
			EXPIRES_IN_IS_TOO_LARGE:
				"The expiresIn is larger than the predefined maximum value.",
			INVALID_REMAINING:
				"The remaining count is either too large or too small.",
			INVALID_PREFIX_LENGTH:
				"The prefix length is either too large or too small.",
			INVALID_NAME_LENGTH: "The name length is either too large or too small.",
			METADATA_DISABLED: "Metadata is disabled.",
			RATE_LIMIT_EXCEEDED: "Rate limit exceeded.",
			NO_VALUES_TO_UPDATE: "No values to update.",
			KEY_DISABLED_EXPIRATION: "Custom key expiration values are disabled.",
			INVALID_API_KEY: "Invalid API key.",
			INVALID_USER_ID_FROM_API_KEY: "The user id from the API key is invalid.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"The reference id from the API key is invalid.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API Key getter returned an invalid key type. Expected string.",
			SERVER_ONLY_PROPERTY:
				"The property you're trying to set can only be set from the server auth instance only.",
			FAILED_TO_UPDATE_API_KEY: "Failed to update API key",
			NAME_REQUIRED: "API Key name is required.",
			ORGANIZATION_ID_REQUIRED:
				"Organization ID is required for organization-owned API keys.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"You are not a member of the organization that owns this API key.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"You do not have permission to perform this action on organization API keys.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"No default api-key configuration found.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Organization plugin is required for organization-owned API keys. Please install and configure the organization plugin.",
		},
		es: {
			INVALID_METADATA_TYPE: "metadata debe ser un objeto o indefinido",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount es obligatorio cuando se proporciona refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval es obligatorio cuando se proporciona refillAmount",
			USER_BANNED: "El usuario está suspendido",
			UNAUTHORIZED_SESSION: "Sesión no autorizada o no válida",
			KEY_NOT_FOUND: "Llave API no encontrada",
			KEY_DISABLED: "La llave API está deshabilitada",
			KEY_EXPIRED: "La llave API ha expirado",
			USAGE_EXCEEDED: "La llave API ha alcanzado su límite de uso",
			KEY_NOT_RECOVERABLE: "La llave API no es recuperable",
			EXPIRES_IN_IS_TOO_SMALL:
				"El valor de expiresIn es menor que el valor mínimo predefinido.",
			EXPIRES_IN_IS_TOO_LARGE:
				"El valor de expiresIn es mayor que el valor máximo predefinido.",
			INVALID_REMAINING:
				"El conteo restante es demasiado grande o demasiado pequeño.",
			INVALID_PREFIX_LENGTH:
				"La longitud del prefijo es demasiado grande o demasiado pequeña.",
			INVALID_NAME_LENGTH:
				"La longitud del nombre es demasiado grande o demasiado pequeña.",
			METADATA_DISABLED: "Los metadatos están deshabilitados.",
			RATE_LIMIT_EXCEEDED: "Límite de velocidad excedido.",
			NO_VALUES_TO_UPDATE: "No hay valores para actualizar.",
			KEY_DISABLED_EXPIRATION:
				"Los valores de expiración de llave personalizados están deshabilitados.",
			INVALID_API_KEY: "Llave API no válida.",
			INVALID_USER_ID_FROM_API_KEY:
				"El ID de usuario de la llave API no es válido.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"El ID de referencia de la llave API no es válido.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"El método getter de la llave API devolvió un tipo de llave no válido. Se esperaba una cadena.",
			SERVER_ONLY_PROPERTY:
				"La propiedad que estás intentando configurar solo se puede establecer desde la instancia de autenticación del servidor.",
			FAILED_TO_UPDATE_API_KEY: "Error al actualizar la llave API",
			NAME_REQUIRED: "El nombre de la llave API es obligatorio.",
			ORGANIZATION_ID_REQUIRED:
				"El ID de la organización es obligatorio para las llaves API propiedad de una organización.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"No eres miembro de la organización propietaria de esta llave API.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"No tienes permiso para realizar esta acción en las llaves API de la organización.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"No se encontró ninguna configuración de llave API predeterminada.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Se requiere el complemento de organización para las llaves API propiedad de la organización. Instala y configura el complemento de organización.",
		},
		fa: {
			INVALID_METADATA_TYPE: "متادیتا باید یک شی یا تعریف نشده باشد",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"وارد کردن refillAmount الزامی است وقتی refillInterval ارائه می‌شود",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"وارد کردن refillInterval الزامی است وقتی refillAmount ارائه می‌شود",
			USER_BANNED: "کاربر مسدود شده است",
			UNAUTHORIZED_SESSION: "نشست غیرمجاز یا نامعتبر",
			KEY_NOT_FOUND: "کلید API یافت نشد",
			KEY_DISABLED: "کلید API غیرفعال است",
			KEY_EXPIRED: "کلید API منقضی شده است",
			USAGE_EXCEEDED: "کلید API به حد مجاز استفاده خود رسیده است",
			KEY_NOT_RECOVERABLE: "کلید API قابل بازیابی نیست",
			EXPIRES_IN_IS_TOO_SMALL:
				"مقدار expiresIn از حداقل مقدار پیش‌فرض کوچک‌تر است.",
			EXPIRES_IN_IS_TOO_LARGE:
				"مقدار expiresIn از حداکثر مقدار پیش‌فرض بزرگ‌تر است.",
			INVALID_REMAINING: "تعداد باقی‌مانده خیلی بزرگ یا خیلی کوچک است.",
			INVALID_PREFIX_LENGTH: "طول پیشوند خیلی بزرگ یا خیلی کوچک است.",
			INVALID_NAME_LENGTH: "طول نام خیلی بزرگ یا خیلی کوچک است.",
			METADATA_DISABLED: "متادیتا غیرفعال است.",
			RATE_LIMIT_EXCEEDED: "محدودیت نرخ فراتر رفته است.",
			NO_VALUES_TO_UPDATE: "هیچ مقداری برای بروزرسانی وجود ندارد.",
			KEY_DISABLED_EXPIRATION: "مقادیر انقضای سفارشی کلید غیرفعال است.",
			INVALID_API_KEY: "کلید API نامعتبر است.",
			INVALID_USER_ID_FROM_API_KEY: "شناسه کاربر از کلید API نامعتبر است.",
			INVALID_REFERENCE_ID_FROM_API_KEY: "شناسه مرجع از کلید API نامعتبر است.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"گیرنده کلید API نوع کلید نامعتبر بازگرداند. رشته متنی مورد انتظار بود.",
			SERVER_ONLY_PROPERTY:
				"ویژگی که می‌خواهید تنظیم کنید فقط از طریق نمونه احراز هویت سرور قابل تنظیم است.",
			FAILED_TO_UPDATE_API_KEY: "بروزرسانی کلید API ناموفق بود",
			NAME_REQUIRED: "نام کلید API الزامی است.",
			ORGANIZATION_ID_REQUIRED:
				"شناسه سازمان برای کلیدهای API متعلق به سازمان الزامی است.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"شما عضو سازمانی که صاحب این کلید API است نیستید.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"شما اجازه انجام این کار را روی کلیدهای API سازمان ندارید.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"هیچ پیکربندی پیش‌فرضی برای کلید API یافت نشد.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"پلاگین سازمان برای کلیدهای API متعلق به سازمان الزامی است. لطفا پلاگین سازمان را نصب و پیکربندی کنید.",
		},
		fr: {
			INVALID_METADATA_TYPE:
				"les métadonnées doivent être un objet ou non définies",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount est requis lorsque refillInterval est fourni",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval est requis lorsque refillAmount est fourni",
			USER_BANNED: "L'utilisateur est banni",
			UNAUTHORIZED_SESSION: "Session non autorisée ou invalide",
			KEY_NOT_FOUND: "Clé API non trouvée",
			KEY_DISABLED: "La clé API est désactivée",
			KEY_EXPIRED: "La clé API a expiré",
			USAGE_EXCEEDED: "La clé API a atteint sa limite d'utilisation",
			KEY_NOT_RECOVERABLE: "La clé API n'est pas récupérable",
			EXPIRES_IN_IS_TOO_SMALL:
				"La valeur expiresIn est plus petite que la valeur minimale prédéfinie.",
			EXPIRES_IN_IS_TOO_LARGE:
				"La valeur expiresIn est plus grande que la valeur maximale prédéfinie.",
			INVALID_REMAINING:
				"Le nombre restant est soit trop grand, soit trop petit.",
			INVALID_PREFIX_LENGTH:
				"La longueur du préfixe est soit trop grande, soit trop petite.",
			INVALID_NAME_LENGTH:
				"La longueur du nom est soit trop grande, soit trop petite.",
			METADATA_DISABLED: "Les métadonnées sont désactivées.",
			RATE_LIMIT_EXCEEDED: "Limite de débit dépassée.",
			NO_VALUES_TO_UPDATE: "Aucune valeur à mettre à jour.",
			KEY_DISABLED_EXPIRATION:
				"Les valeurs d'expiration de clé personnalisées sont désactivées.",
			INVALID_API_KEY: "Clé API invalide.",
			INVALID_USER_ID_FROM_API_KEY:
				"L'ID utilisateur de la clé API est invalide.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"L'ID de référence de la clé API est invalide.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Le getter de clé API a renvoyé un type de clé invalide. Chaîne attendue.",
			SERVER_ONLY_PROPERTY:
				"La propriété que vous tentez de définir ne peut être définie que depuis l'instance d'authentification du serveur.",
			FAILED_TO_UPDATE_API_KEY: "Échec de la mise à jour de la clé API",
			NAME_REQUIRED: "Le nom de la clé API est requis.",
			ORGANIZATION_ID_REQUIRED:
				"L'ID de l'organisation est requis pour les clés API appartenant à une organisation.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Vous n'êtes pas membre de l'organisation qui possède cette clé API.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Vous n'avez pas l'autorisation d'effectuer cette action sur les clés API de l'organisation.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Aucune configuration de clé API par défaut trouvée.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Le plugin d'organisation est requis pour les clés API appartenant à l'organisation. Veuillez installer et configurer le plugin d'organisation.",
		},
		hi: {
			INVALID_METADATA_TYPE: "मेटाडेटा एक ऑब्जेक्ट या अपरिभाषित होना चाहिए",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"जब refillInterval प्रदान किया जाता है तो refillAmount आवश्यक है",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"जब refillAmount प्रदान किया जाता है तो refillInterval आवश्यक है",
			USER_BANNED: "उपयोगकर्ता प्रतिबंधित है",
			UNAUTHORIZED_SESSION: "अनधिकृत या अमान्य सत्र",
			KEY_NOT_FOUND: "API कुंजी नहीं मिली",
			KEY_DISABLED: "API कुंजी अक्षम है",
			KEY_EXPIRED: "API कुंजी समाप्त हो गई है",
			USAGE_EXCEEDED: "API कुंजी अपनी उपयोग सीमा तक पहुँच गई है",
			KEY_NOT_RECOVERABLE: "API कुंजी पुनर्प्राप्त करने योग्य नहीं है",
			EXPIRES_IN_IS_TOO_SMALL: "expiresIn पूर्व-निर्धारित न्यूनतम मान से छोटा है।",
			EXPIRES_IN_IS_TOO_LARGE: "expiresIn पूर्व-निर्धारित अधिकतम मान से बड़ा है।",
			INVALID_REMAINING: "शेष गणना या तो बहुत बड़ी है या बहुत छोटी।",
			INVALID_PREFIX_LENGTH: "उपसर्ग की लंबाई या तो बहुत बड़ी है या बहुत छोटी।",
			INVALID_NAME_LENGTH: "नाम की लंबाई या तो बहुत बड़ी है या बहुत छोटी।",
			METADATA_DISABLED: "मेटाडेटा अक्षम है।",
			RATE_LIMIT_EXCEEDED: "दर सीमा पार हो गई।",
			NO_VALUES_TO_UPDATE: "अपडेट करने के लिए कोई मान नहीं।",
			KEY_DISABLED_EXPIRATION: "कस्टम कुंजी समाप्ति मान अक्षम हैं।",
			INVALID_API_KEY: "अमान्य API कुंजी।",
			INVALID_USER_ID_FROM_API_KEY: "API कुंजी से उपयोगकर्ता आईडी अमान्य है।",
			INVALID_REFERENCE_ID_FROM_API_KEY: "API कुंजी से संदर्भ आईडी अमान्य है।",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API कुंजी गेटर ने अमान्य कुंजी प्रकार लौटाया। स्ट्रिंग अपेक्षित।",
			SERVER_ONLY_PROPERTY:
				"आप जिस प्रॉपर्टी को सेट करने का प्रयास कर रहे हैं उसे केवल सर्वर ऑथ इंस्टेंस से ही सेट किया जा सकता है।",
			FAILED_TO_UPDATE_API_KEY: "API कुंजी अपडेट करने में विफल",
			NAME_REQUIRED: "API कुंजी का नाम आवश्यक है।",
			ORGANIZATION_ID_REQUIRED:
				"संगठन के स्वामित्व वाली API कुंजियों के लिए संगठन आईडी आवश्यक है।",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"आप उस संगठन के सदस्य नहीं हैं जिसके पास यह API कुंजी है।",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"आपके पास संगठन API कुंजियों पर यह कार्रवाई करने की अनुमति नहीं है।",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"कोई डिफ़ॉल्ट API कुंजी कॉन्फ़िगरेशन नहीं मिला।",
			ORGANIZATION_PLUGIN_REQUIRED:
				"संगठन के स्वामित्व वाली API कुंजियों के लिए संगठन प्लगइन आवश्यक है। कृपया संगठन प्लगइन इंस्टॉल और कॉन्फ़िगर करें।",
		},
		id: {
			INVALID_METADATA_TYPE:
				"metadata harus berupa objek atau tidak ditentukan",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount diperlukan jika refillInterval disediakan",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval diperlukan jika refillAmount disediakan",
			USER_BANNED: "Pengguna diblokir",
			UNAUTHORIZED_SESSION: "Sesi tidak terotorisasi atau tidak valid",
			KEY_NOT_FOUND: "Kunci API tidak ditemukan",
			KEY_DISABLED: "Kunci API dinonaktifkan",
			KEY_EXPIRED: "Kunci API telah kedaluwarsa",
			USAGE_EXCEEDED: "Kunci API telah mencapai batas penggunaannya",
			KEY_NOT_RECOVERABLE: "Kunci API tidak dapat dipulihkan",
			EXPIRES_IN_IS_TOO_SMALL:
				"Nilai expiresIn lebih kecil dari nilai minimum yang ditentukan.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Nilai expiresIn lebih besar dari nilai maksimum yang ditentukan.",
			INVALID_REMAINING: "Jumlah tersisa terlalu besar atau terlalu kecil.",
			INVALID_PREFIX_LENGTH:
				"Panjang prefiks terlalu besar atau terlalu kecil.",
			INVALID_NAME_LENGTH: "Panjang nama terlalu besar atau terlalu kecil.",
			METADATA_DISABLED: "Metadata dinonaktifkan.",
			RATE_LIMIT_EXCEEDED: "Batas kecepatan terlampaui.",
			NO_VALUES_TO_UPDATE: "Tidak ada nilai untuk diperbarui.",
			KEY_DISABLED_EXPIRATION: "Nilai kedaluwarsa kunci khusus dinonaktifkan.",
			INVALID_API_KEY: "Kunci API tidak valid.",
			INVALID_USER_ID_FROM_API_KEY: "ID pengguna dari kunci API tidak valid.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"ID referensi dari kunci API tidak valid.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Getter kunci API mengembalikan tipe kunci yang tidak valid. Diharapkan string.",
			SERVER_ONLY_PROPERTY:
				"Properti yang ingin Anda atur hanya dapat dikonfigurasi melalui instans auth server.",
			FAILED_TO_UPDATE_API_KEY: "Gagal memperbarui kunci API",
			NAME_REQUIRED: "Nama kunci API diperlukan.",
			ORGANIZATION_ID_REQUIRED:
				"ID Organisasi diperlukan untuk kunci API milik organisasi.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Anda bukan anggota organisasi pemilik kunci API ini.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Anda tidak memiliki izin untuk melakukan tindakan ini pada kunci API organisasi.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Tidak ada konfigurasi kunci API default yang ditemukan.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Plugin organisasi diperlukan untuk kunci API milik organisasi. Silakan instal dan konfigurasi plugin organisasi.",
		},
		it: {
			INVALID_METADATA_TYPE:
				"i metadati devono essere un oggetto o non definiti",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount è richiesto quando viene fornito refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval è richiesto quando viene fornito refillAmount",
			USER_BANNED: "L'utente è bandito",
			UNAUTHORIZED_SESSION: "Sessione non autorizzata o non valida",
			KEY_NOT_FOUND: "Chiave API non trovata",
			KEY_DISABLED: "La chiave API è disabilitata",
			KEY_EXPIRED: "La chiave API è scaduta",
			USAGE_EXCEEDED: "La chiave API ha raggiunto il limite di utilizzo",
			KEY_NOT_RECOVERABLE: "La chiave API non è recuperável",
			EXPIRES_IN_IS_TOO_SMALL:
				"Il valore expiresIn è inferiore al valore minimo predefinito.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Il valore expiresIn è superiore al valore massimo predefinito.",
			INVALID_REMAINING:
				"Il conteggio rimanente è troppo grande o troppo piccolo.",
			INVALID_PREFIX_LENGTH:
				"La lunghezza del prefisso è troppo grande o troppo piccola.",
			INVALID_NAME_LENGTH:
				"La lunghezza del nome è troppo grande o troppo piccola.",
			METADATA_DISABLED: "I metadati sono disabilitati.",
			RATE_LIMIT_EXCEEDED: "Limite di velocità superato.",
			NO_VALUES_TO_UPDATE: "Nessun valore da aggiornare.",
			KEY_DISABLED_EXPIRATION:
				"I valori di scadenza della chiave personalizzati sono disabilitati.",
			INVALID_API_KEY: "Chiave API non valida.",
			INVALID_USER_ID_FROM_API_KEY:
				"L'ID utente della chiave API non è valido.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"L'ID di riferimento della chiave API non è valido.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Il getter della chiave API ha restituito un tipo di chiave non valido. Atteso stringa.",
			SERVER_ONLY_PROPERTY:
				"La proprietà che stai tentando di impostare può essere configurata solo dall'istanza di autenticazione del server.",
			FAILED_TO_UPDATE_API_KEY: "Impossibile aggiornare la chiave API",
			NAME_REQUIRED: "Il nome della chiave API è richiesto.",
			ORGANIZATION_ID_REQUIRED:
				"L'ID dell'organizzazione è richiesto per le chiavi API di proprietà dell'organizzazione.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Non sei un membro dell'organizzazione che possiede questa chiave API.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Non hai i permessi per eseguire questa azione sulle chiavi API dell'organizzazione.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Nessuna configurazione della chiave API predefinita trovata.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Il plugin di organizzazione è richiesto per le chiavi API di proprietà dell'organizzazione. Installa e configura il plugin di organizzazione.",
		},
		ja: {
			INVALID_METADATA_TYPE:
				"メタデータはオブジェクトまたは未定義である必要があります",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillIntervalが提供される場合、refillAmountが必要です",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillAmountが提供される場合、refillIntervalが必要です",
			USER_BANNED: "ユーザーは禁止されています",
			UNAUTHORIZED_SESSION: "未認可または無効なセッション",
			KEY_NOT_FOUND: "APIキーが見つかりません",
			KEY_DISABLED: "APIキーは無効化されています",
			KEY_EXPIRED: "APIキーは期限切れです",
			USAGE_EXCEEDED: "APIキーの使用制限に達しました",
			KEY_NOT_RECOVERABLE: "APIキーは復元できません",
			EXPIRES_IN_IS_TOO_SMALL:
				"expiresInの値が事前に定義された最小値よりも小さいです。",
			EXPIRES_IN_IS_TOO_LARGE:
				"expiresInの値が事前に定義された最大値よりも大きいです。",
			INVALID_REMAINING: "残りの数は大きすぎるか小さすぎます。",
			INVALID_PREFIX_LENGTH: "プレフィックスの長さは長すぎるか短すぎます。",
			INVALID_NAME_LENGTH: "名前の長さは長すぎるか短すぎます。",
			METADATA_DISABLED: "メタデータは無効になっています。",
			RATE_LIMIT_EXCEEDED: "レート制限を超過しました。",
			NO_VALUES_TO_UPDATE: "更新する値がありません。",
			KEY_DISABLED_EXPIRATION: "カスタムキーの有効期限値は無効になっています。",
			INVALID_API_KEY: "無効なAPIキーです。",
			INVALID_USER_ID_FROM_API_KEY: "APIキーのユーザーIDが無効です。",
			INVALID_REFERENCE_ID_FROM_API_KEY: "APIキーのリファレンスIDが無効です。",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"APIキーゲッターが無効なキータイプを返しました。文字列が期待されます。",
			SERVER_ONLY_PROPERTY:
				"設定しようとしているプロパティは、サーバー認証インスタンスからのみ設定できます。",
			FAILED_TO_UPDATE_API_KEY: "APIキーの更新に失敗しました",
			NAME_REQUIRED: "APIキーの名前が必要です。",
			ORGANIZATION_ID_REQUIRED: "組織が所有するAPIキーには組織IDが必要です。",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"このAPIキーを所有する組織のメンバーではありません。",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"組織のAPIキーに対してこのアクションを実行する権限がありません。",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"デフォルトのAPIキー構成が見つかりません。",
			ORGANIZATION_PLUGIN_REQUIRED:
				"組織が所有するAPIキーには組織プラグインが必要です。組織プラグインをインストールして構成してください。",
		},
		ko: {
			INVALID_METADATA_TYPE: "메타데이터는 객체이거나 정의되지 않아야 합니다",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillInterval이 제공될 때 refillAmount가 필요합니다",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillAmount가 제공될 때 refillInterval이 필요합니다",
			USER_BANNED: "사용자가 차단되었습니다",
			UNAUTHORIZED_SESSION: "인증되지 않았거나 올바르지 않은 세션",
			KEY_NOT_FOUND: "API 키를 찾을 수 없습니다",
			KEY_DISABLED: "API 키가 비활성화되었습니다",
			KEY_EXPIRED: "API 키가 만료되었습니다",
			USAGE_EXCEEDED: "API 키의 사용 제한에 도달했습니다",
			KEY_NOT_RECOVERABLE: "API 키를 복구할 수 없습니다",
			EXPIRES_IN_IS_TOO_SMALL: "expiresIn 값이 정의된 최소값보다 작습니다.",
			EXPIRES_IN_IS_TOO_LARGE: "expiresIn 값이 정의된 최대값보다 큽니다.",
			INVALID_REMAINING: "남은 횟수가 너무 많거나 적습니다.",
			INVALID_PREFIX_LENGTH: "접두사 길이가 너무 길거나 짧습니다.",
			INVALID_NAME_LENGTH: "이름 길이가 너무 길거나 짧습니다.",
			METADATA_DISABLED: "메타데이터가 비활성화되었습니다.",
			RATE_LIMIT_EXCEEDED: "요청 제한을 초과했습니다.",
			NO_VALUES_TO_UPDATE: "업데이트할 값이 없습니다.",
			KEY_DISABLED_EXPIRATION: "사용자 지정 키 만료 설정은 비활성화되었습니다.",
			INVALID_API_KEY: "올바르지 않은 API 키입니다.",
			INVALID_USER_ID_FROM_API_KEY: "API 키의 사용자 ID가 올바르지 않습니다.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"API 키의 참조 ID가 올바르지 않습니다.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API 키 게터가 잘못된 키 형식을 반환했습니다. 문자열 형식이어야 합니다.",
			SERVER_ONLY_PROPERTY:
				"설정하려는 속성은 서버 인증 인스턴스에서만 설정할 수 있습니다.",
			FAILED_TO_UPDATE_API_KEY: "API 키 업데이트에 실패했습니다",
			NAME_REQUIRED: "API 키 이름이 필요합니다.",
			ORGANIZATION_ID_REQUIRED: "조직 소유 API 키에는 조직 ID가 필요합니다.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"이 API 키를 소유한 조직의 멤버가 아닙니다.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"조직 API 키에 대한 동작을 수행할 권한이 없습니다.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"기본 API 키 설정을 찾을 수 없습니다.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"조직 소유 API 키에는 조직 플러그인이 필요합니다. 조직 플러그인을 설치하고 설정해 주세요.",
		},
		nl: {
			INVALID_METADATA_TYPE: "metadata moet een object of ongedefinieerd zijn",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount is vereist wanneer refillInterval is opgegeven",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval is vereist wanneer refillAmount is opgegeven",
			USER_BANNED: "Gebruiker is verbannen",
			UNAUTHORIZED_SESSION: "Niet-geautoriseerde of ongeldige sessie",
			KEY_NOT_FOUND: "API-sleutel niet gevonden",
			KEY_DISABLED: "API-sleutel is uitgeschakeld",
			KEY_EXPIRED: "API-sleutel is verlopen",
			USAGE_EXCEEDED: "API-sleutel heeft de gebruikslimiet bereikt",
			KEY_NOT_RECOVERABLE: "API-sleutel is niet herstelbaar",
			EXPIRES_IN_IS_TOO_SMALL:
				"De waarde van expiresIn is kleiner dan de vooraf gedefinieerde minimumwaarde.",
			EXPIRES_IN_IS_TOO_LARGE:
				"De waarde van expiresIn is groter dan de vooraf gedefinieerde maximumwaarde.",
			INVALID_REMAINING: "Het resterende aantal is te groot of te klein.",
			INVALID_PREFIX_LENGTH: "De voorvoegsellengte is te groot of te klein.",
			INVALID_NAME_LENGTH: "De naamlengte is te groot of te klein.",
			METADATA_DISABLED: "Metadata is uitgeschakeld.",
			RATE_LIMIT_EXCEEDED: "Tarieflimiet overschreden.",
			NO_VALUES_TO_UPDATE: "Geen waarden om bij te werken.",
			KEY_DISABLED_EXPIRATION:
				"Aangepaste sleutelverloopwaarden zijn uitgeschakeld.",
			INVALID_API_KEY: "Ongeldige API-sleutel.",
			INVALID_USER_ID_FROM_API_KEY:
				"De gebruikers-ID van de API-sleutel is ongeldig.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"De referentie-ID van de API-sleutel is ongeldig.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API-sleutel getter retourneerde een ongeldig sleuteltype. String verwacht.",
			SERVER_ONLY_PROPERTY:
				"De eigenschap die u probeert in te stellen kan alleen worden geconfigureerd vanaf de server-auth-instantie.",
			FAILED_TO_UPDATE_API_KEY: "Bijwerken API-sleutel mislukt",
			NAME_REQUIRED: "Naam van de API-sleutel is vereist.",
			ORGANIZATION_ID_REQUIRED:
				"Organisatie-ID is vereist voor API-sleutels van een organisatie.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"U bent geen lid van de organisatie die eigenaar is van deze API-sleutel.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"U hebt geen toestemming om deze actie uit te voeren op organisatie API-sleutels.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Geen standaard API-sleutelconfiguratie gevonden.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Organisatie-plugin is vereist voor API-sleutels van een organisatie. Installeer en configureer de organisatie-plugin.",
		},
		pl: {
			INVALID_METADATA_TYPE:
				"metadane muszą być obiektem lub wartością niezdefiniowaną",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount jest wymagane, gdy podano refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval jest wymagane, gdy podano refillAmount",
			USER_BANNED: "Użytkownik jest zablokowany",
			UNAUTHORIZED_SESSION: "Nieautoryzowana lub nieprawidłowa sesja",
			KEY_NOT_FOUND: "Nie znaleziono klucza API",
			KEY_DISABLED: "Klucz API jest wyłączony",
			KEY_EXPIRED: "Klucz API wygasł",
			USAGE_EXCEEDED: "Klucz API osiągnął limit użycia",
			KEY_NOT_RECOVERABLE: "Klucz API jest nieodzyskiwalny",
			EXPIRES_IN_IS_TOO_SMALL:
				"Wartość expiresIn jest mniejsza niż zdefiniowana wartość minimalna.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Wartość expiresIn jest większa niż zdefiniowana wartość maksymalna.",
			INVALID_REMAINING: "Pozostała liczba jest zbyt duża lub zbyt mała.",
			INVALID_PREFIX_LENGTH: "Długość prefiksu jest zbyt duża lub zbyt mała.",
			INVALID_NAME_LENGTH: "Długość nazwy jest zbyt duża lub zbyt mała.",
			METADATA_DISABLED: "Metadane są wyłączone.",
			RATE_LIMIT_EXCEEDED: "Przekroczono limit zapytań.",
			NO_VALUES_TO_UPDATE: "Brak wartości do aktualizacji.",
			KEY_DISABLED_EXPIRATION:
				"Niestandardowe wartości wygasania klucza są wyłączone.",
			INVALID_API_KEY: "Nieprawidłowy klucz API.",
			INVALID_USER_ID_FROM_API_KEY:
				"Identyfikator użytkownika z klucza API jest nieprawidłowy.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"Identyfikator referencyjny z klucza API jest nieprawidłowy.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Getter klucza API zwrócił nieprawidłowy typ klucza. Oczekiwano ciągu znaków.",
			SERVER_ONLY_PROPERTY:
				"Właściwość, którą próbujesz ustawić, może być skonfigurowana tylko z poziomu instancji uwierzytelniania serwera.",
			FAILED_TO_UPDATE_API_KEY: "Aktualizacja klucza API nie powiodła się",
			NAME_REQUIRED: "Nazwa klucza API jest wymagana.",
			ORGANIZATION_ID_REQUIRED:
				"Identyfikator organizacji jest wymagany dla kluczy API należących do organizacji.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Nie jesteś członkiem organizacji, która jest właścicielem tego klucza API.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Nie masz uprawnień do wykonania tej operacji na kluczach API organizacji.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Nie znaleziono domyślnej konfiguracji klucza API.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Wtyczka organizacji jest wymagana dla kluczy API należących do organizacji. Zainstaluj i skonfiguruj wtyczkę organizacji.",
		},
		pt: {
			INVALID_METADATA_TYPE: "os metadados devem ser um objeto ou indefinidos",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount é obrigatório quando refillInterval é fornecido",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval é obrigatório quando refillAmount é fornecido",
			USER_BANNED: "Usuário banido",
			UNAUTHORIZED_SESSION: "Sessão não autorizada ou inválida",
			KEY_NOT_FOUND: "Chave API não encontrada",
			KEY_DISABLED: "Chave API está desativada",
			KEY_EXPIRED: "Chave API expirou",
			USAGE_EXCEEDED: "A chave API atingiu seu limite de uso",
			KEY_NOT_RECOVERABLE: "A chave API não é recuperável",
			EXPIRES_IN_IS_TOO_SMALL:
				"O valor de expiresIn é menor do que o mínimo predefinido.",
			EXPIRES_IN_IS_TOO_LARGE:
				"O valor de expiresIn é maior do que o máximo predefinido.",
			INVALID_REMAINING: "A contagem restante é muito grande ou muito pequena.",
			INVALID_PREFIX_LENGTH:
				"O comprimento do prefixo é muito grande ou muito pequeno.",
			INVALID_NAME_LENGTH:
				"O comprimento do nome é muito grande ou muito pequeno.",
			METADATA_DISABLED: "Os metadados estão desativados.",
			RATE_LIMIT_EXCEEDED: "Limite de taxa excedido.",
			NO_VALUES_TO_UPDATE: "Não há valores para atualizar.",
			KEY_DISABLED_EXPIRATION:
				"Valores personalizados de expiração de chave estão desativados.",
			INVALID_API_KEY: "Chave API inválida.",
			INVALID_USER_ID_FROM_API_KEY: "O ID do usuário da chave API é inválido.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"O ID de referência da chave API é inválido.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"O getter da chave API retornou um tipo inválido. Esperado string.",
			SERVER_ONLY_PROPERTY:
				"A propriedade que você está tentando configurar só pode ser definida a partir da instância de referência do servidor.",
			FAILED_TO_UPDATE_API_KEY: "Falha ao atualizar a chave API",
			NAME_REQUIRED: "O nome da chave API é obrigatório.",
			ORGANIZATION_ID_REQUIRED:
				"O ID da organização é obrigatório para chaves API pertencentes à organização.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Você não é um membro da organização proprietária desta chave API.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Você não tem permissão para realizar esta ação em chaves API da organização.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Nenhuma configuração padrão de chave API encontrada.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"O plugin de organização é necessário para chaves API pertencentes à organização. Instale e configure o plugin de organização.",
		},
		ru: {
			INVALID_METADATA_TYPE:
				"метаданные должны быть объектом или быть неопределенными",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"Поле refillAmount обязательно, если указано refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"Поле refillInterval обязательно, если указано refillAmount",
			USER_BANNED: "Пользователь заблокирован",
			UNAUTHORIZED_SESSION: "Неавторизованная или недействительная сессия",
			KEY_NOT_FOUND: "API-ключ не найден",
			KEY_DISABLED: "API-ключ отключен",
			KEY_EXPIRED: "API-ключ истек",
			USAGE_EXCEEDED: "API-ключ исчерпал лимит использования",
			KEY_NOT_RECOVERABLE: "API-ключ не подлежит восстановлению",
			EXPIRES_IN_IS_TOO_SMALL:
				"Значение expiresIn меньше предопределенного минимального значения.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Значение expiresIn больше предопределенного максимального значения.",
			INVALID_REMAINING:
				"Оставшееся количество либо слишком велико, либо слишком мало.",
			INVALID_PREFIX_LENGTH:
				"Длина префикса либо слишком велика, либо слишком мала.",
			INVALID_NAME_LENGTH:
				"Длина имени либо слишком велика, либо слишком мала.",
			METADATA_DISABLED: "Метаданные отключены.",
			RATE_LIMIT_EXCEEDED: "Превышен лимит запросов.",
			NO_VALUES_TO_UPDATE: "Нет значений для обновления.",
			KEY_DISABLED_EXPIRATION: "Настраиваемый срок действия ключа отключен.",
			INVALID_API_KEY: "Недействительный API-ключ.",
			INVALID_USER_ID_FROM_API_KEY:
				"Идентификатор пользователя из API-ключа недействителен.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"Идентификатор ссылки из API-ключа недействителен.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Геттер API-ключа вернул неверный тип ключа. Ожидалась строка.",
			SERVER_ONLY_PROPERTY:
				"Свойство, которое вы пытаетесь задать, может быть установлено только из экземпляра аутентификации сервера.",
			FAILED_TO_UPDATE_API_KEY: "Не удалось обновить API-ключ",
			NAME_REQUIRED: "Требуется имя API-ключа.",
			ORGANIZATION_ID_REQUIRED:
				"Идентификатор организации требуется для API-ключей, принадлежащих организации.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Вы не являетесь членом организации, владеющей этим API-ключом.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"У вас нет прав на выполнение этого действия с API-ключами организации.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Конфигурация по умолчанию для API-ключей не найдена.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Плагин организации требуется для API-ключей, принадлежащих организации. Пожалуйста, установите и настройте плагин организации.",
		},
		sv: {
			INVALID_METADATA_TYPE: "metadata måste vara ett objekt eller odefinierat",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount krävs när refillInterval tillhandahålls",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval krävs när refillAmount tillhandahålls",
			USER_BANNED: "Användaren är avstängd",
			UNAUTHORIZED_SESSION: "Obehörig eller ogiltig session",
			KEY_NOT_FOUND: "API-nyckel hittades inte",
			KEY_DISABLED: "API-nyckel är inaktiverad",
			KEY_EXPIRED: "API-nyckel har gått ut",
			USAGE_EXCEEDED: "API-nyckel har nått sin användningsgräns",
			KEY_NOT_RECOVERABLE: "API-nyckel är inte återställningsbar",
			EXPIRES_IN_IS_TOO_SMALL:
				"expiresIn är mindre än det fördefinierade minimivärdet.",
			EXPIRES_IN_IS_TOO_LARGE:
				"expiresIn är större än det fördefinierade maximivärdet.",
			INVALID_REMAINING:
				"Det kvarvarande antalet är antingen för stort eller för litet.",
			INVALID_PREFIX_LENGTH:
				"Prefixlängden är antingen för stor eller för liten.",
			INVALID_NAME_LENGTH: "Namnlängden är antingen för stor eller för liten.",
			METADATA_DISABLED: "Metadata är inaktiverad.",
			RATE_LIMIT_EXCEEDED: "Hastighetsbegränsning överskriden.",
			NO_VALUES_TO_UPDATE: "Inga värden att uppdatera.",
			KEY_DISABLED_EXPIRATION:
				"Anpassade värden för nyckelns utgångstid är inaktiverade.",
			INVALID_API_KEY: "Ogiltig API-nyckel.",
			INVALID_USER_ID_FROM_API_KEY: "Användar-ID från API-nyckeln är ogiltigt.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"Referens-ID från API-nyckeln är ogiltigt.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API-nyckelns getter returnerade en ogiltig nyckeltyp. Sträng förväntades.",
			SERVER_ONLY_PROPERTY:
				"Egenskapen du försöker sätta kan endast ställas in från serverns autentiseringsinstans.",
			FAILED_TO_UPDATE_API_KEY: "Misslyckades med att uppdatera API-nyckel",
			NAME_REQUIRED: "API-nyckelns namn krävs.",
			ORGANIZATION_ID_REQUIRED:
				"Organisations-ID krävs för API-nycklar som ägs av en organisation.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Du är inte medlem i organisationen som äger denna API-nyckel.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Du har inte tillåtelse att utföra denna åtgärd på organisationens API-nycklar.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Ingen standardkonfiguration för API-nycklar hittades.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Organisationsplugin krävs för API-nycklar som ägs av en organisation. Installera och konfigurera organisationspluginen.",
		},
		tr: {
			INVALID_METADATA_TYPE: "metadata nesne veya tanımsız olmalıdır",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillInterval sağlandığında refillAmount gereklidir",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillAmount sağlandığında refillInterval gereklidir",
			USER_BANNED: "Kullanıcı engellendi",
			UNAUTHORIZED_SESSION: "Yetkisiz veya geçersiz oturum",
			KEY_NOT_FOUND: "API Anahtarı bulunamadı",
			KEY_DISABLED: "API Anahtarı devre dışı",
			KEY_EXPIRED: "API Anahtarının süresi doldu",
			USAGE_EXCEEDED: "API Anahtarı kullanım sınırına ulaştı",
			KEY_NOT_RECOVERABLE: "API Anahtarı kurtarılamaz",
			EXPIRES_IN_IS_TOO_SMALL:
				"expiresIn değeri önceden tanımlanmış minimum değerden küçük.",
			EXPIRES_IN_IS_TOO_LARGE:
				"expiresIn değeri önceden tanımlanmış maksimum değerden büyük.",
			INVALID_REMAINING: "Kalan sayı ya çok büyük ya da çok küçük.",
			INVALID_PREFIX_LENGTH: "Önek uzunluğu ya çok büyük ya da çok küçük.",
			INVALID_NAME_LENGTH: "Ad uzunluğu ya çok büyük ya da çok küçük.",
			METADATA_DISABLED: "Metadata devre dışı bırakıldı.",
			RATE_LIMIT_EXCEEDED: "İstek oranı sınırı aşıldı.",
			NO_VALUES_TO_UPDATE: "Güncellenecek değer yok.",
			KEY_DISABLED_EXPIRATION:
				"Özel anahtar son kullanma değerleri devre dışı.",
			INVALID_API_KEY: "Geçersiz API anahtarı.",
			INVALID_USER_ID_FROM_API_KEY:
				"API anahtarındaki kullanıcı kimliği geçersiz.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"API anahtarındaki referans kimliği geçersiz.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API Anahtarı alıcısı geçersiz bir anahtar türü döndürdü. Dizi bekleniyordu.",
			SERVER_ONLY_PROPERTY:
				"Ayarlamaya çalıştığınız özellik yalnızca sunucu kimlik doğrulama örneğinden ayarlanabilir.",
			FAILED_TO_UPDATE_API_KEY: "API anahtarı güncellenemedi",
			NAME_REQUIRED: "API Anahtarı adı gerekli.",
			ORGANIZATION_ID_REQUIRED:
				"Organizasyona ait API anahtarları için Organizasyon Kimliği gereklidir.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Bu API anahtarına sahip olan organizasyonun üyesi değilsiniz.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Organizasyon API anahtarları üzerinde bu işlemi gerçekleştirme izniniz yok.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Varsayılan api-anahtarı yapılandırması bulunamadı.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Organizasyona ait API anahtarları için organizasyon eklentisi gereklidir. Lütfen organizasyon eklentisini kurun ve yapılandırın.",
		},
		uk: {
			INVALID_METADATA_TYPE:
				"метадані мають бути об'єктом або бути невизначеними",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"Поле refillAmount є обов'язковим, якщо вказано refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"Поле refillInterval є обов'язковим, якщо вказано refillAmount",
			USER_BANNED: "Користувач заблокований",
			UNAUTHORIZED_SESSION: "Неавторизована або недійсна сесія",
			KEY_NOT_FOUND: "API-ключ не знайдено",
			KEY_DISABLED: "API-ключ вимкнено",
			KEY_EXPIRED: "Термін дії API-ключа закінчився",
			USAGE_EXCEEDED: "API-ключ вичерпав ліміт використання",
			KEY_NOT_RECOVERABLE: "API-ключ не підлягає відновленню",
			EXPIRES_IN_IS_TOO_SMALL:
				"Значення expiresIn менше за встановлене мінімальне значення.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Значення expiresIn більше за встановлене максимальне значення.",
			INVALID_REMAINING:
				"Залишок спроб або занадто великий, або занадто малий.",
			INVALID_PREFIX_LENGTH:
				"Довжина префікса або занадто велика, або занадто мала.",
			INVALID_NAME_LENGTH:
				"Довжина імені або занадто велика, або занадто мала.",
			METADATA_DISABLED: "Метадані вимкнено.",
			RATE_LIMIT_EXCEEDED: "Перевищено ліміт запитів.",
			NO_VALUES_TO_UPDATE: "Немає значень для оновлення.",
			KEY_DISABLED_EXPIRATION: "Користувацький термін дії ключа вимкнено.",
			INVALID_API_KEY: "Недійсний API-ключ.",
			INVALID_USER_ID_FROM_API_KEY:
				"Ідентифікатор користувача з API-ключа недійсний.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"Ідентифікатор посилання з API-ключа недійсний.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Геттер API-ключа повернув недійсний тип ключа. Очікувався рядок.",
			SERVER_ONLY_PROPERTY:
				"Властивість, яку ви намагаєтеся встановити, може бути налаштована лише з екземпляра автентифікації сервера.",
			FAILED_TO_UPDATE_API_KEY: "Не вдалося оновити API-ключ",
			NAME_REQUIRED: "Потрібне ім'я API-ключа.",
			ORGANIZATION_ID_REQUIRED:
				"Ідентифікатор організації потрібен для API-ключів, що належать організації.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Ви не є членом організації, яка володіє цим API-ключем.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"У вас немає дозволу на виконання цієї дії з API-ключами організації.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Конфігурацію за замовчуванням для API-ключів не знайдено.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Плагін організації потрібен для API-ключів, що належать організації. Будь ласка, встановіть та налаштуйте плагін організації.",
		},
		vi: {
			INVALID_METADATA_TYPE:
				"metadata phải là một đối tượng hoặc không xác định",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"refillAmount là bắt buộc khi refillInterval được cung cấp",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"refillInterval là bắt buộc khi refillAmount được cung cấp",
			USER_BANNED: "Người dùng đã bị cấm",
			UNAUTHORIZED_SESSION: "Phiên không được xác thực hoặc không hợp lệ",
			KEY_NOT_FOUND: "Không tìm thấy khóa API",
			KEY_DISABLED: "Khóa API đã bị vô hiệu hóa",
			KEY_EXPIRED: "Khóa API đã hết hạn",
			USAGE_EXCEEDED: "Khóa API đã đạt đến giới hạn sử dụng",
			KEY_NOT_RECOVERABLE: "Khóa API không thể phục hồi",
			EXPIRES_IN_IS_TOO_SMALL:
				"Giá trị expiresIn nhỏ hơn giá trị tối thiểu đã được thiết lập trước.",
			EXPIRES_IN_IS_TOO_LARGE:
				"Giá trị expiresIn lớn hơn giá trị tối đa đã được thiết lập trước.",
			INVALID_REMAINING: "Số lượt còn lại quá lớn hoặc quá nhỏ.",
			INVALID_PREFIX_LENGTH: "Độ dài tiền tố quá lớn hoặc quá nhỏ.",
			INVALID_NAME_LENGTH: "Độ dài tên quá lớn hoặc quá nhỏ.",
			METADATA_DISABLED: "Metadata đã bị vô hiệu hóa.",
			RATE_LIMIT_EXCEEDED: "Đã vượt quá giới hạn tần suất.",
			NO_VALUES_TO_UPDATE: "Không có giá trị nào để cập nhật.",
			KEY_DISABLED_EXPIRATION:
				"Giá trị hết hạn tùy chỉnh của khóa đã bị vô hiệu hóa.",
			INVALID_API_KEY: "Khóa API không hợp lệ.",
			INVALID_USER_ID_FROM_API_KEY: "ID người dùng từ khóa API không hợp lệ.",
			INVALID_REFERENCE_ID_FROM_API_KEY:
				"ID tham chiếu từ khóa API không hợp lệ.",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"Getter khóa API đã trả về một kiểu khóa không hợp lệ. Mong đợi một chuỗi.",
			SERVER_ONLY_PROPERTY:
				"Thuộc tính bạn đang cố gắng đặt chỉ có thể được thiết lập từ phiên bản xác thực của máy chủ.",
			FAILED_TO_UPDATE_API_KEY: "Cập nhật khóa API thất bại",
			NAME_REQUIRED: "Tên khóa API là bắt buộc.",
			ORGANIZATION_ID_REQUIRED:
				"ID tổ chức là bắt buộc đối với các khóa API do tổ chức sở hữu.",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"Bạn không phải là thành viên của tổ chức sở hữu khóa API này.",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"Bạn không có quyền thực hiện hành động này trên các khóa API của tổ chức.",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
				"Không tìm thấy cấu hình khóa API mặc định.",
			ORGANIZATION_PLUGIN_REQUIRED:
				"Plugin tổ chức là bắt buộc đối với các khóa API do tổ chức sở hữu. Vui lòng cài đặt và cấu hình plugin tổ chức.",
		},
		zh: {
			INVALID_METADATA_TYPE: "元数据必须是对象或未定义",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"提供 refillInterval 时，refillAmount 是必填的",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"提供 refillAmount 时，refillInterval 是必填的",
			USER_BANNED: "用户已被封禁",
			UNAUTHORIZED_SESSION: "未授权或无效的会话",
			KEY_NOT_FOUND: "未找到 API 密钥",
			KEY_DISABLED: "API 密钥已被禁用",
			KEY_EXPIRED: "API 密钥已过期",
			USAGE_EXCEEDED: "API 密钥已达到其使用限制",
			KEY_NOT_RECOVERABLE: "API 密钥不可恢复",
			EXPIRES_IN_IS_TOO_SMALL: "expiresIn 值小于预设的最小值。",
			EXPIRES_IN_IS_TOO_LARGE: "expiresIn 值大于预设的最大值。",
			INVALID_REMAINING: "剩余次数太大或太小。",
			INVALID_PREFIX_LENGTH: "前缀长度太大或太小。",
			INVALID_NAME_LENGTH: "名称长度太大或太小。",
			METADATA_DISABLED: "元数据已被禁用。",
			RATE_LIMIT_EXCEEDED: "超出速率限制。",
			NO_VALUES_TO_UPDATE: "没有要更新的值。",
			KEY_DISABLED_EXPIRATION: "自定义密钥过期值已被禁用。",
			INVALID_API_KEY: "无效的 API 密钥。",
			INVALID_USER_ID_FROM_API_KEY: "API 密钥中的用户 ID 无效。",
			INVALID_REFERENCE_ID_FROM_API_KEY: "API 密钥中的引用 ID 无效。",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"API 密钥获取器返回了无效的密钥类型。预期为字符串。",
			SERVER_ONLY_PROPERTY:
				"您尝试设置的属性只能从服务器身份验证实例进行设置。",
			FAILED_TO_UPDATE_API_KEY: "更新 API 密钥失败",
			NAME_REQUIRED: "API 密钥名称是必填的。",
			ORGANIZATION_ID_REQUIRED: "组织拥owned的 API 密钥需要组织 ID。",
			USER_NOT_MEMBER_OF_ORGANIZATION: "您不是拥有此 API 密钥的组织的成员。",
			INSUFFICIENT_API_KEY_PERMISSIONS: "您无权对组织 API 密钥执行此操作。",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND: "未找到默认 API 密钥配置。",
			ORGANIZATION_PLUGIN_REQUIRED:
				"组织拥有的 API 密钥需要组织插件。请安装并配置组织插件。",
		},
		th: {
			INVALID_METADATA_TYPE: "ข้อมูลเมตาต้องเป็นออบเจกต์หรือไม่ได้ระบุไว้",
			REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
				"จำเป็นต้องระบุ refillAmount เมื่อกำหนด refillInterval",
			REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
				"จำเป็นต้องระบุ refillInterval เมื่อกำหนด refillAmount",
			USER_BANNED: "ผู้ใช้ถูกระงับการใช้งาน",
			UNAUTHORIZED_SESSION: "เซสชันไม่ได้รับการยืนยันตัวตนหรือไม่ถูกต้อง",
			KEY_NOT_FOUND: "ไม่พบรหัส API Key",
			KEY_DISABLED: "API Key ถูกปิดใช้งาน",
			KEY_EXPIRED: "API Key หมดอายุแล้ว",
			USAGE_EXCEEDED: "API Key เกินขีดจำกัดการใช้งานแล้ว",
			KEY_NOT_RECOVERABLE: "API Key ไม่สามารถกู้คืนได้",
			EXPIRES_IN_IS_TOO_SMALL: "ค่า expiresIn น้อยกว่าค่าต่ำสุดที่กำหนดไว้ล่วงหน้า",
			EXPIRES_IN_IS_TOO_LARGE: "ค่า expiresIn มากกว่าค่าสูงสุดที่กำหนดไว้ล่วงหน้า",
			INVALID_REMAINING: "จำนวนการใช้งานที่เหลืออยู่มากเกินไปหรือน้อยเกินไป",
			INVALID_PREFIX_LENGTH: "ความยาวของคำนำหน้ายาวเกินไปหรือสั้นเกินไป",
			INVALID_NAME_LENGTH: "ความยาวของชื่อยาวเกินไปหรือสั้นเกินไป",
			METADATA_DISABLED: "ข้อมูลเมตาถูกปิดใช้งาน",
			RATE_LIMIT_EXCEEDED: "เกินขีดจำกัดการเรียกใช้งาน",
			NO_VALUES_TO_UPDATE: "ไม่มีค่าที่จะอัปเดต",
			KEY_DISABLED_EXPIRATION: "การกำหนดวันหมดอายุคีย์เองถูกปิดใช้งาน",
			INVALID_API_KEY: "API Key ไม่ถูกต้อง",
			INVALID_USER_ID_FROM_API_KEY: "User ID จาก API Key ไม่ถูกต้อง",
			INVALID_REFERENCE_ID_FROM_API_KEY: "Reference ID จาก API Key ไม่ถูกต้อง",
			INVALID_API_KEY_GETTER_RETURN_TYPE:
				"ฟังก์ชันดึงค่า API Key คืนค่าประเภทคีย์ที่ไม่ถูกต้อง คาดว่าเป็นสตริง",
			SERVER_ONLY_PROPERTY:
				"คุณสมบัติที่คุณพยายามกำหนดสามารถตั้งค่าได้จากอินสแตนซ์ auth ของเซิร์ฟเวอร์เท่านั้น",
			FAILED_TO_UPDATE_API_KEY: "อัปเดต API Key ล้มเหลว",
			NAME_REQUIRED: "จำเป็นต้องระบุชื่อ API Key",
			ORGANIZATION_ID_REQUIRED: "จำเป็นต้องระบุรหัสองค์กรสำหรับ API Key ขององค์กร",
			USER_NOT_MEMBER_OF_ORGANIZATION:
				"คุณไม่ได้เป็นสมาชิกขององค์กรที่เป็นเจ้าของ API Key นี้",
			INSUFFICIENT_API_KEY_PERMISSIONS:
				"คุณไม่มีสิทธิ์ในการดำเนินการนี้บน API Key ขององค์กร",
			NO_DEFAULT_API_KEY_CONFIGURATION_FOUND: "ไม่พบการตั้งค่าเริ่มต้นของ API Key",
			ORGANIZATION_PLUGIN_REQUIRED:
				"จำเป็นต้องใช้ปลั๊กอินองค์กรสำหรับ API Key ขององค์กร โปรดติดตั้งและกำหนดค่าปลั๊กอินองค์กร",
		},
	};
