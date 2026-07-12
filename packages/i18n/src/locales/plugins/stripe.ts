import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { ErrorTranslations } from "../../types";

export const stripeTranslations: ErrorTranslations<typeof STRIPE_ERROR_CODES> =
	{
		ar: {
			UNAUTHORIZED: "وصول غير مصرح به",
			INVALID_REQUEST_BODY: "جسم طلب غير صالح",
			SUBSCRIPTION_NOT_FOUND: "الاشتراك غير موجود",
			SUBSCRIPTION_PLAN_NOT_FOUND: "خطة الاشتراك غير موجودة",
			ALREADY_SUBSCRIBED_PLAN: "أنت مشترك بالفعل في هذه الخطة",
			REFERENCE_ID_NOT_ALLOWED: "المعرف المرجعي غير مسموح به",
			CUSTOMER_NOT_FOUND: "لم يتم العثور على عميل Stripe لهذا المستخدم",
			UNABLE_TO_CREATE_CUSTOMER: "غير قادر على إنشاء عميل",
			UNABLE_TO_CREATE_BILLING_PORTAL: "غير قادر على إنشاء جلسة بوابة الفواتير",
			STRIPE_SIGNATURE_NOT_FOUND: "توقيع Stripe غير موجود",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "سر Stripe webhook غير موجود",
			STRIPE_WEBHOOK_ERROR: "خطأ في Stripe webhook",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "فشل بناء حدث Stripe",
			FAILED_TO_FETCH_PLANS: "فشل جلب الخطط",
			EMAIL_VERIFICATION_REQUIRED:
				"التحقق من البريد الإلكتروني مطلوب قبل أن تتمكن من الاشتراك في خطة",
			SUBSCRIPTION_NOT_ACTIVE: "الاشتراك غير نشط",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION: "الاشتراك غير مجدول للإلغاء",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"ليس لدى الاشتراك إلغاء معلق أو تغيير خطة مجدول",
			ORGANIZATION_NOT_FOUND: "المنظمة غير موجودة",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "اشتراك المنظمة غير مفعل",
			AUTHORIZE_REFERENCE_REQUIRED:
				"تتطلب اشتراكات المنظمة تهيئة استدعاء authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"لا يمكن حذف المنظمة التي لديها اشتراك نشط",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"المعرف المرجعي مطلوب. يرجى تقديم referenceId أو تعيين activeOrganizationId في الجلسة",
		},
		bn: {
			UNAUTHORIZED: "অননুমোদিত অ্যাক্সেস",
			INVALID_REQUEST_BODY: "অনুরোধের মূল অংশটি অবৈধ",
			SUBSCRIPTION_NOT_FOUND: "সাবস্ক্রিপশন পাওয়া যায়নি",
			SUBSCRIPTION_PLAN_NOT_FOUND: "সাবস্ক্রিপশন প্ল্যান পাওয়া যায়নি",
			ALREADY_SUBSCRIBED_PLAN: "আপনি ইতিমধ্যেই এই প্ল্যানে সাবস্ক্রাইব করেছেন",
			REFERENCE_ID_NOT_ALLOWED: "রেফারেন্স আইডি অনুমোদিত নয়",
			CUSTOMER_NOT_FOUND: "এই ব্যবহারকারীর জন্য স্ট্রাইপ কাস্টমার পাওয়া যায়নি",
			UNABLE_TO_CREATE_CUSTOMER: "কাস্টমার তৈরি করতে অক্ষম",
			UNABLE_TO_CREATE_BILLING_PORTAL: "বিলিং পোর্টাল সেশন তৈরি করতে অক্ষম",
			STRIPE_SIGNATURE_NOT_FOUND: "স্ট্রাইপ সিগনেচার পাওয়া যায়নি",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "স্ট্রাইপ ওয়েবহুক সিক্রেট পাওয়া যায়নি",
			STRIPE_WEBHOOK_ERROR: "স্ট্রাইপ ওয়েবহুক ত্রুটি",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "স্ট্রাইপ ইভেন্ট তৈরি করতে ব্যর্থ হয়েছে",
			FAILED_TO_FETCH_PLANS: "প্ল্যানগুলো আনতে ব্যর্থ হয়েছে",
			EMAIL_VERIFICATION_REQUIRED:
				"একটি প্ল্যানে সাবস্ক্রাইব করার আগে ইমেল যাচাইকরণ প্রয়োজন",
			SUBSCRIPTION_NOT_ACTIVE: "সাবস্ক্রিপশন সক্রিয় নয়",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"সাবস্ক্রিপশন বাতিলের জন্য নির্ধারিত নয়",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"সাবস্ক্রিপশনে কোনো মুলতুবি বাতিল বা নির্ধারিত প্ল্যান পরিবর্তন নেই",
			ORGANIZATION_NOT_FOUND: "সংস্থা পাওয়া যায়নি",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "সংস্থার সাবস্ক্রিপশন সক্রিয় করা নেই",
			AUTHORIZE_REFERENCE_REQUIRED:
				"সংস্থার সাবস্ক্রিপশনের জন্য authorizeReference কলব্যাক কনফিগার করা প্রয়োজন",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"সক্রিয় সাবস্ক্রিপশন থাকা অবস্থায় সংস্থাটি মুছে ফেলা যাবে না",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"রেফারেন্স আইডি প্রয়োজন। referenceId প্রদান করুন অথবা সেশনে activeOrganizationId সেট করুন",
		},
		de: {
			UNAUTHORIZED: "Unbefugter Zugriff",
			INVALID_REQUEST_BODY: "Ungültiger Anfrage-Body",
			SUBSCRIPTION_NOT_FOUND: "Abonnement nicht gefunden",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Abonnement-Plan nicht gefunden",
			ALREADY_SUBSCRIBED_PLAN: "Sie haben diesen Plan bereits abonniert",
			REFERENCE_ID_NOT_ALLOWED: "Referenz-ID ist nicht erlaubt",
			CUSTOMER_NOT_FOUND: "Stripe-Kunde für diesen Benutzer nicht gefunden",
			UNABLE_TO_CREATE_CUSTOMER: "Kunde konnte nicht erstellt werden",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Sitzung für Abrechnungsportal konnte nicht erstellt werden",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripe-Signatur nicht gefunden",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Stripe-Webhook-Geheimnis nicht gefunden",
			STRIPE_WEBHOOK_ERROR: "Stripe-Webhook-Fehler",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Stripe-Event konnte nicht erstellt werden",
			FAILED_TO_FETCH_PLANS: "Pläne konnten nicht geladen werden",
			EMAIL_VERIFICATION_REQUIRED:
				"Eine E-Mail-Verifizierung ist erforderlich, bevor Sie einen Plan abonnieren können",
			SUBSCRIPTION_NOT_ACTIVE: "Abonnement ist nicht aktiv",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Abonnement ist nicht zur Kündigung vorgemerkt",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Abonnement hat keine ausstehende Kündigung oder geplante Planänderung",
			ORGANIZATION_NOT_FOUND: "Organisation nicht gefunden",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Organisations-Abonnement ist nicht aktiviert",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Organisations-Abonnements erfordern die Konfiguration des authorizeReference-Callbacks",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Organisation mit aktivem Abonnement kann nicht gelöscht werden",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Referenz-ID ist erforderlich. Geben Sie referenceId an oder setzen Sie activeOrganizationId in der Sitzung",
		},
		en: {
			UNAUTHORIZED: "Unauthorized access",
			INVALID_REQUEST_BODY: "Invalid request body",
			SUBSCRIPTION_NOT_FOUND: "Subscription not found",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
			ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
			REFERENCE_ID_NOT_ALLOWED: "Reference id is not allowed",
			CUSTOMER_NOT_FOUND: "Stripe customer not found for this user",
			UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Unable to create billing portal session",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripe signature not found",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook secret not found",
			STRIPE_WEBHOOK_ERROR: "Stripe webhook error",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Failed to construct Stripe event",
			FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
			EMAIL_VERIFICATION_REQUIRED:
				"Email verification is required before you can subscribe to a plan",
			SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Subscription is not scheduled for cancellation",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Subscription has no pending cancellation or scheduled plan change",
			ORGANIZATION_NOT_FOUND: "Organization not found",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Organization subscription is not enabled",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Organization subscriptions require authorizeReference callback to be configured",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Cannot delete organization with active subscription",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Reference ID is required. Provide referenceId or set activeOrganizationId in session",
		},
		es: {
			UNAUTHORIZED: "Acceso no autorizado",
			INVALID_REQUEST_BODY: "Cuerpo de solicitud no válido",
			SUBSCRIPTION_NOT_FOUND: "Suscripción no encontrada",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Plan de suscripción no encontrado",
			ALREADY_SUBSCRIBED_PLAN: "Ya estás suscrito a este plan",
			REFERENCE_ID_NOT_ALLOWED: "El ID de referencia no está permitido",
			CUSTOMER_NOT_FOUND: "Cliente de Stripe no encontrado para este usuario",
			UNABLE_TO_CREATE_CUSTOMER: "No se pudo crear el cliente",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"No se pudo crear la sesión del portal de facturación",
			STRIPE_SIGNATURE_NOT_FOUND: "Firma de Stripe no encontrada",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Secreto del webhook de Stripe no encontrado",
			STRIPE_WEBHOOK_ERROR: "Error del webhook de Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Error al construir el evento de Stripe",
			FAILED_TO_FETCH_PLANS: "Error al obtener los planes",
			EMAIL_VERIFICATION_REQUIRED:
				"Se requiere verificar el correo electrónico antes de poder suscribirse a un plan",
			SUBSCRIPTION_NOT_ACTIVE: "La suscripción no está activa",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"La suscripción no está programada para su cancelación",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"La suscripción no tiene ninguna cancelación pendiente ni cambio de plan programado",
			ORGANIZATION_NOT_FOUND: "Organización no encontrada",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"La suscripción de la organización no está habilitada",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Las suscripciones de la organización requieren configurar la función callback authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"No se puede eliminar la organización con una suscripción activa",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"El ID de referencia es obligatorio. Proporcione referenceId o configure activeOrganizationId en la sesión",
		},
		fa: {
			UNAUTHORIZED: "دسترسی غیرمجاز",
			INVALID_REQUEST_BODY: "پیکره درخواست نامعتبر است",
			SUBSCRIPTION_NOT_FOUND: "اشتراک یافت نشد",
			SUBSCRIPTION_PLAN_NOT_FOUND: "طرح اشتراک یافت نشد",
			ALREADY_SUBSCRIBED_PLAN: "شما در حال حاضر مشترک این طرح هستید",
			REFERENCE_ID_NOT_ALLOWED: "شناسه مرجع مجاز نیست",
			CUSTOMER_NOT_FOUND: "مشتری Stripe برای این کاربر یافت نشد",
			UNABLE_TO_CREATE_CUSTOMER: "امکان ایجاد مشتری وجود ندارد",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"امکان ایجاد نشست پرتال صورتحساب وجود ندارد",
			STRIPE_SIGNATURE_NOT_FOUND: "امضای Stripe یافت نشد",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "راز هوک وب Stripe یافت نشد",
			STRIPE_WEBHOOK_ERROR: "خطای هوک وب Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "ساخت رویداد Stripe ناموفق بود",
			FAILED_TO_FETCH_PLANS: "دریافت طرح‌ها ناموفق بود",
			EMAIL_VERIFICATION_REQUIRED:
				"تایید ایمیل پیش از مشترک شدن در طرح الزامی است",
			SUBSCRIPTION_NOT_ACTIVE: "اشتراک فعال نیست",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"اشتراک برای لغو برنامه‌ریزی نشده است",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"اشتراک هیچ لغو معلق یا تغییر طرح برنامه‌ریزی شده‌ای ندارد",
			ORGANIZATION_NOT_FOUND: "سازمان یافت نشد",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "اشتراک سازمان فعال نیست",
			AUTHORIZE_REFERENCE_REQUIRED:
				"اشتراک‌های سازمان نیاز به پیکربندی تابع بازخورد authorizeReference دارند",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"امکان حذف سازمان با اشتراک فعال وجود ندارد",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"شناسه مرجع الزامی است. referenceId را ارائه دهید یا activeOrganizationId را در نشست تنظیم کنید",
		},
		fr: {
			UNAUTHORIZED: "Accès non autorisé",
			INVALID_REQUEST_BODY: "Corps de requête invalide",
			SUBSCRIPTION_NOT_FOUND: "Abonnement non trouvé",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Plan d'abonnement non trouvé",
			ALREADY_SUBSCRIBED_PLAN: "Vous êtes déjà abonné à ce plan",
			REFERENCE_ID_NOT_ALLOWED: "L'ID de référence n'est pas autorisé",
			CUSTOMER_NOT_FOUND: "Client Stripe non trouvé pour cet utilisateur",
			UNABLE_TO_CREATE_CUSTOMER: "Impossible de créer le client",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Impossible de créer la session du portail de facturation",
			STRIPE_SIGNATURE_NOT_FOUND: "Signature Stripe non trouvée",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Secret du webhook Stripe non trouvé",
			STRIPE_WEBHOOK_ERROR: "Erreur de webhook Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Échec de la construction de l'événement Stripe",
			FAILED_TO_FETCH_PLANS: "Échec de la récupération des plans",
			EMAIL_VERIFICATION_REQUIRED:
				"La vérification de l'adresse e-mail est requise avant de pouvoir vous abonner à un plan",
			SUBSCRIPTION_NOT_ACTIVE: "L'abonnement n'est pas actif",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"L'abonnement n'est pas programmé pour annulation",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"L'abonnement n'a aucune annulation en attente ni changement de plan programmé",
			ORGANIZATION_NOT_FOUND: "Organisation non trouvée",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"L'abonnement d'organisation n'est pas activé",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Les abonnements d'organisation nécessitent la configuration du rappel authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Impossible de supprimer une organisation avec un abonnement actif",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"L'ID de référence est requis. Fournissez referenceId ou définissez activeOrganizationId dans la session",
		},
		hi: {
			UNAUTHORIZED: "अनधिकृत पहुंच",
			INVALID_REQUEST_BODY: "अमान्य अनुरोध निकाय",
			SUBSCRIPTION_NOT_FOUND: "सदस्यता नहीं मिली",
			SUBSCRIPTION_PLAN_NOT_FOUND: "सदस्यता योजना नहीं मिली",
			ALREADY_SUBSCRIBED_PLAN: "आपने पहले से ही इस योजना की सदस्यता ले रखी है",
			REFERENCE_ID_NOT_ALLOWED: "संदर्भ आईडी की अनुमति नहीं है",
			CUSTOMER_NOT_FOUND: "इस उपयोगकर्ता के लिए स्ट्राइप ग्राहक नहीं मिला",
			UNABLE_TO_CREATE_CUSTOMER: "ग्राहक बनाने में असमर्थ",
			UNABLE_TO_CREATE_BILLING_PORTAL: "बिलिंग पोर्टल सत्र बनाने में असमर्थ",
			STRIPE_SIGNATURE_NOT_FOUND: "स्ट्राइप हस्ताक्षर नहीं मिला",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "स्ट्राइप वेबहुक गुप्त नहीं मिला",
			STRIPE_WEBHOOK_ERROR: "स्ट्राइप वेबहुक त्रुटि",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "स्ट्राइप इवेंट बनाने में विफल",
			FAILED_TO_FETCH_PLANS: "योजनाएं प्राप्त करने में विफल",
			EMAIL_VERIFICATION_REQUIRED:
				"योजना की सदस्यता लेने से पहले ईमेल सत्यापन आवश्यक है",
			SUBSCRIPTION_NOT_ACTIVE: "सदस्यता सक्रिय नहीं है",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"सदस्यता रद्द करने के लिए निर्धारित नहीं है",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"सदस्यता में कोई लंबित रद्दीकरण या निर्धारित योजना परिवर्तन नहीं है",
			ORGANIZATION_NOT_FOUND: "संगठन नहीं मिला",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "संगठन सदस्यता सक्षम नहीं है",
			AUTHORIZE_REFERENCE_REQUIRED:
				"संगठन सदस्यताओं के लिए authorizeReference कॉलबैक कॉन्फ़िगर करना आवश्यक है",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"सक्रिय सदस्यता वाले संगठन को हटाया नहीं जा सकता",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"संदर्भ आईडी आवश्यक है। referenceId प्रदान करें या सत्र में activeOrganizationId सेट करें",
		},
		id: {
			UNAUTHORIZED: "Akses tidak sah",
			INVALID_REQUEST_BODY: "Isi permintaan tidak valid",
			SUBSCRIPTION_NOT_FOUND: "Langganan tidak ditemukan",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Paket langganan tidak ditemukan",
			ALREADY_SUBSCRIBED_PLAN: "Anda sudah berlangganan paket ini",
			REFERENCE_ID_NOT_ALLOWED: "ID referensi tidak diperbolehkan",
			CUSTOMER_NOT_FOUND: "Pelanggan Stripe tidak ditemukan untuk pengguna ini",
			UNABLE_TO_CREATE_CUSTOMER: "Tidak dapat membuat pelanggan",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Tidak dapat membuat sesi portal tagihan",
			STRIPE_SIGNATURE_NOT_FOUND: "Tanda tangan Stripe tidak ditemukan",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Rahasia webhook Stripe tidak ditemukan",
			STRIPE_WEBHOOK_ERROR: "Kesalahan webhook Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Gagal membuat acara Stripe",
			FAILED_TO_FETCH_PLANS: "Gagal mengambil rencana",
			EMAIL_VERIFICATION_REQUIRED:
				"Verifikasi email diperlukan sebelum Anda dapat berlangganan paket",
			SUBSCRIPTION_NOT_ACTIVE: "Langganan tidak aktif",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Langganan tidak dijadwalkan untuk pembatalan",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Langganan tidak memiliki pembatalan yang tertunda atau perubahan rencana yang dijadwalkan",
			ORGANIZATION_NOT_FOUND: "Organisasi tidak ditemukan",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Langganan organisasi tidak diaktifkan",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Langganan organisasi memerlukan konfigurasi callback authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Tidak dapat menghapus organisasi dengan langganan aktif",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"ID Referensi diperlukan. Berikan referenceId atau atur activeOrganizationId dalam sesi",
		},
		it: {
			UNAUTHORIZED: "Accesso non autorizzato",
			INVALID_REQUEST_BODY: "Corpo della richiesta non valido",
			SUBSCRIPTION_NOT_FOUND: "Abbonamento non trovato",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Piano di abbonamento non trovato",
			ALREADY_SUBSCRIBED_PLAN: "Sei già iscritto a questo piano",
			REFERENCE_ID_NOT_ALLOWED: "L'ID di riferimento non è consentito",
			CUSTOMER_NOT_FOUND: "Cliente Stripe non trovato per questo utente",
			UNABLE_TO_CREATE_CUSTOMER: "Impossibile creare il cliente",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Impossibile creare la sessione del portale di fatturazione",
			STRIPE_SIGNATURE_NOT_FOUND: "Firma di Stripe non trovata",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Segreto del webhook di Stripe non trovato",
			STRIPE_WEBHOOK_ERROR: "Errore del webhook di Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Impossibile costruire l'evento di Stripe",
			FAILED_TO_FETCH_PLANS: "Impossibile recuperare i piani",
			EMAIL_VERIFICATION_REQUIRED:
				"La verifica dell'e-mail è richiesta prima di potersi abbonare a un piano",
			SUBSCRIPTION_NOT_ACTIVE: "L'abbonamento non è attivo",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"L'abbonamento non è programmato per la cancellazione",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"L'abbonamento non ha alcuna cancellazione in sospeso o cambio di piano programmato",
			ORGANIZATION_NOT_FOUND: "Organizzazione non trovata",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"L'abbonamento dell'organizzazione non è abilitato",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Gli abbonamenti dell'organizzazione richiedono la configurazione della callback authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Impossibile eliminare l'organizzazione con un abbonamento attivo",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"L'ID di riferimento è richiesto. Fornisci referenceId o imposta activeOrganizationId nella sessione",
		},
		ja: {
			UNAUTHORIZED: "不正なアクセス",
			INVALID_REQUEST_BODY: "無効なリクエストボディ",
			SUBSCRIPTION_NOT_FOUND: "サブスクリプションが見つかりません",
			SUBSCRIPTION_PLAN_NOT_FOUND: "サブスクリプションプランが見つかりません",
			ALREADY_SUBSCRIBED_PLAN: "既にこのプランを購読しています",
			REFERENCE_ID_NOT_ALLOWED: "リファレンスIDは許可されていません",
			CUSTOMER_NOT_FOUND: "このユーザーのStripeカスタマーが見つかりません",
			UNABLE_TO_CREATE_CUSTOMER: "顧客を作成できません",
			UNABLE_TO_CREATE_BILLING_PORTAL: "ポータルセッションを作成できません",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripeシグネチャが見つかりません",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Stripe Webhookシークレットが見つかりません",
			STRIPE_WEBHOOK_ERROR: "Stripe Webhookエラー",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Stripeイベントの構築に失敗しました",
			FAILED_TO_FETCH_PLANS: "プランの取得に失敗しました",
			EMAIL_VERIFICATION_REQUIRED: "プランを購読する前にメール検証が必要です",
			SUBSCRIPTION_NOT_ACTIVE: "サブスクリプションが有効ではありません",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"サブスクリプションのキャンセルはスケジュールされていません",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"サブスクリプションに保留中のキャンセルや予定されたプラン変更はありません",
			ORGANIZATION_NOT_FOUND: "組織が見つかりません",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"組織サブスクリプションが有効になっていません",
			AUTHORIZE_REFERENCE_REQUIRED:
				"組織サブスクリプションにはauthorizeReferenceコールバックの設定が必要です",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"有効なサブスクリプションを持つ組織は削除できません",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"リファレンスIDが必要です。referenceIdを提供するか、セッションにactiveOrganizationIdを設定してください",
		},
		ko: {
			UNAUTHORIZED: "권한이 없는 접근",
			INVALID_REQUEST_BODY: "올바르지 않은 요청 본문",
			SUBSCRIPTION_NOT_FOUND: "구독을 찾을 수 없습니다",
			SUBSCRIPTION_PLAN_NOT_FOUND: "구독 요금제를 찾을 수 없습니다",
			ALREADY_SUBSCRIBED_PLAN: "이미 이 요금제를 구독 중입니다",
			REFERENCE_ID_NOT_ALLOWED: "참조 ID는 허용되지 않습니다",
			CUSTOMER_NOT_FOUND: "이 사용자의 Stripe 고객 정보를 찾을 수 없습니다",
			UNABLE_TO_CREATE_CUSTOMER: "고객 정보를 생성할 수 없습니다",
			UNABLE_TO_CREATE_BILLING_PORTAL: "결제 포탈 세션을 생성할 수 없습니다",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripe 서명을 찾을 수 없습니다",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe 웹훅 비밀키를 찾을 수 없습니다",
			STRIPE_WEBHOOK_ERROR: "Stripe 웹훅 오류",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Stripe 이벤트를 구성하는 데 실패했습니다",
			FAILED_TO_FETCH_PLANS: "요금제를 가져오는 데 실패했습니다",
			EMAIL_VERIFICATION_REQUIRED:
				"요금제를 구독하려면 이메일 인증이 필요합니다",
			SUBSCRIPTION_NOT_ACTIVE: "구독이 활성화 상태가 아닙니다",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"구독 해지가 예약되어 있지 않습니다",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"구독에 대기 중인 해지나 예약된 요금제 변경이 없습니다",
			ORGANIZATION_NOT_FOUND: "조직을 찾을 수 없습니다",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"조직 구독이 활성화되어 있지 않습니다",
			AUTHORIZE_REFERENCE_REQUIRED:
				"조직 구독 설정을 위해서는 authorizeReference 콜백을 설정해야 합니다",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"활성화된 구독이 있는 조직은 삭제할 수 없습니다",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"참조 ID가 필요합니다. referenceId를 제공하거나 세션에 activeOrganizationId를 설정해 주세요",
		},
		nl: {
			UNAUTHORIZED: "Onbevoegde toegang",
			INVALID_REQUEST_BODY: "Ongeldige aanvraagtekst",
			SUBSCRIPTION_NOT_FOUND: "Abonnement niet gevonden",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Abonnementsplan niet gevonden",
			ALREADY_SUBSCRIBED_PLAN: "U bent al geabonneerd op dit plan",
			REFERENCE_ID_NOT_ALLOWED: "Referentie-ID is niet toegestaan",
			CUSTOMER_NOT_FOUND: "Stripe-klant niet gevonden voor deze gebruiker",
			UNABLE_TO_CREATE_CUSTOMER: "Kan klant niet aanmaken",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Kan factureringsportaalsessie niet aanmaken",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripe-handtekening niet gevonden",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe-webhookgeheim niet gevonden",
			STRIPE_WEBHOOK_ERROR: "Stripe-webhookfout",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Kan Stripe-evenement niet construeren",
			FAILED_TO_FETCH_PLANS: "Kan plannen niet ophalen",
			EMAIL_VERIFICATION_REQUIRED:
				"E-mailverificatie is vereist voordat u zich op een plan kunt abonneren",
			SUBSCRIPTION_NOT_ACTIVE: "Abonnement is niet actief",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Abonnement is niet gepland voor opzegging",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Abonnement heeft geen openstaande opzegging of geplande planwijziging",
			ORGANIZATION_NOT_FOUND: "Organisatie niet gevonden",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Organisatieabonnement is niet ingeschakeld",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Organisatieabonnementen vereisen de configuratie van de callback authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Kan organisatie met actief abonnement niet verwijderen",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Referentie-ID is vereist. Geef referenceId op of stel activeOrganizationId in de sessie in",
		},
		pl: {
			UNAUTHORIZED: "Nieautoryzowany dostęp",
			INVALID_REQUEST_BODY: "Nieprawidłowa treść zapytania",
			SUBSCRIPTION_NOT_FOUND: "Nie znaleziono subskrypcji",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Nie znaleziono planu subskrypcji",
			ALREADY_SUBSCRIBED_PLAN: "Już subskrybujesz ten plan",
			REFERENCE_ID_NOT_ALLOWED: "Identyfikator referencyjny jest niedozwolony",
			CUSTOMER_NOT_FOUND: "Nie znaleziono klienta Stripe dla tego użytkownika",
			UNABLE_TO_CREATE_CUSTOMER: "Nie można utworzyć klienta",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Nie można utworzyć sesji portalu rozliczeniowego",
			STRIPE_SIGNATURE_NOT_FOUND: "Nie znaleziono podpisu Stripe",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Nie znaleziono klucza tajnego webhooka Stripe",
			STRIPE_WEBHOOK_ERROR: "Błąd webhooka Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Nie udało się utworzyć zdarzenia Stripe",
			FAILED_TO_FETCH_PLANS: "Nie udało się pobrać planów",
			EMAIL_VERIFICATION_REQUIRED:
				"Wymagana jest weryfikacja adresu e-mail przed subskrypcją planu",
			SUBSCRIPTION_NOT_ACTIVE: "Subskrypcja nie jest aktywna",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Anulowanie subskrypcji nie jest zaplanowane",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Subskrypcja nie ma oczekującego anulowania ani zaplanowanej zmiany planu",
			ORGANIZATION_NOT_FOUND: "Nie znaleziono organizacji",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Subskrypcja organizacji nie jest włączona",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Subskrypcje organizacji wymagają skonfigurowania wywołania zwrotnego authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Nie można usunąć organizacji z aktywną subskrypcją",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Wymagany jest identyfikator referencyjny. Podaj referenceId lub ustaw activeOrganizationId w sesji",
		},
		pt: {
			UNAUTHORIZED: "Acesso não autorizado",
			INVALID_REQUEST_BODY: "Corpo da requisição inválido",
			SUBSCRIPTION_NOT_FOUND: "Assinatura não encontrada",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Plano de assinatura não encontrado",
			ALREADY_SUBSCRIBED_PLAN: "Você já está inscrito neste plano",
			REFERENCE_ID_NOT_ALLOWED: "ID de referência não é permitido",
			CUSTOMER_NOT_FOUND: "Cliente Stripe não encontrado para este usuário",
			UNABLE_TO_CREATE_CUSTOMER: "Não foi possível criar o cliente",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Não foi possível criar a sessão do portal de faturação",
			STRIPE_SIGNATURE_NOT_FOUND: "Assinatura Stripe não encontrada",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Segredo do webhook Stripe não encontrado",
			STRIPE_WEBHOOK_ERROR: "Erro no webhook Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Falha ao construir evento Stripe",
			FAILED_TO_FETCH_PLANS: "Falha ao buscar planos",
			EMAIL_VERIFICATION_REQUIRED:
				"A verificação por e-mail é necessária antes de poder assinar um plano",
			SUBSCRIPTION_NOT_ACTIVE: "Assinatura não está ativa",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Assinatura não está programada para cancelamento",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"A assinatura não possui cancelamento pendente ou mudança de plano agendada",
			ORGANIZATION_NOT_FOUND: "Organização não encontrada",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Assinatura de organização não está ativada",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Assinaturas de organização exigem a configuração do callback authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Não é possível excluir uma organização com assinatura ativa",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"ID de referência é obrigatório. Forneça referenceId ou defina activeOrganizationId na sessão",
		},
		ru: {
			UNAUTHORIZED: "Неавторизованный доступ",
			INVALID_REQUEST_BODY: "Неверное тело запроса",
			SUBSCRIPTION_NOT_FOUND: "Подписка не найдена",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Тарифный план не найден",
			ALREADY_SUBSCRIBED_PLAN: "Вы уже подписаны на этот тариф",
			REFERENCE_ID_NOT_ALLOWED: "Идентификатор ссылки не разрешен",
			CUSTOMER_NOT_FOUND: "Клиент Stripe для этого пользователя не найден",
			UNABLE_TO_CREATE_CUSTOMER: "Не удалось создать клиента",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Не удалось создать сессию портала оплаты",
			STRIPE_SIGNATURE_NOT_FOUND: "Подпись Stripe не найдена",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Секрет вебхука Stripe не найден",
			STRIPE_WEBHOOK_ERROR: "Ошибка вебхука Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Не удалось создать событие Stripe",
			FAILED_TO_FETCH_PLANS: "Не удалось получить тарифы",
			EMAIL_VERIFICATION_REQUIRED:
				"Для подписки на тариф требуется подтверждение электронной почты",
			SUBSCRIPTION_NOT_ACTIVE: "Подписка не активна",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Отмена подписки не запланирована",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"У подписки нет ожидающих отмен или запланированных изменений тарифа",
			ORGANIZATION_NOT_FOUND: "Организация не найдена",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "Подписка организации не включена",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Для подписок организации требуется настроить обратный вызов authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Нельзя удалить организацию с активной подпиской",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Требуется идентификатор ссылки. Укажите referenceId или задайте activeOrganizationId в сессии",
		},
		sv: {
			UNAUTHORIZED: "Obehörig åtkomst",
			INVALID_REQUEST_BODY: "Ogiltig förfrågan",
			SUBSCRIPTION_NOT_FOUND: "Prenumeration hittades inte",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Prenumerationsplan hittades inte",
			ALREADY_SUBSCRIBED_PLAN: "Du prenumererar redan på denna plan",
			REFERENCE_ID_NOT_ALLOWED: "Referens-ID är inte tillåtet",
			CUSTOMER_NOT_FOUND: "Stripe-kund hittades inte för denna användare",
			UNABLE_TO_CREATE_CUSTOMER: "Kunde inte skapa kund",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Kunde inte skapa session för faktureringsportal",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripe-signatur hittades inte",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe-webhookhemlighet hittades inte",
			STRIPE_WEBHOOK_ERROR: "Stripe-webhookfel",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT:
				"Misslyckades med att konstruera Stripe-händelse",
			FAILED_TO_FETCH_PLANS: "Misslyckades med att hämta planer",
			EMAIL_VERIFICATION_REQUIRED:
				"E-postverifiering krävs innan du kan prenumerera på en plan",
			SUBSCRIPTION_NOT_ACTIVE: "Prenumerationen är inte aktiv",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Prenumerationen är inte schemalagd för uppsägning",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Prenumerationen har ingen väntande uppsägning eller schemalagd planändring",
			ORGANIZATION_NOT_FOUND: "Organisationen hittades inte",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Organisationsprenumeration är inte aktiverad",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Organisationsprenumerationer kräver att authorizeReference-callback konfigureras",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Det går inte att ta bort en organisation med en aktiv prenumeration",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Referens-ID krävs. Ange referenceId eller ställ in activeOrganizationId i sessionen",
		},
		tr: {
			UNAUTHORIZED: "Yetkisiz erişim",
			INVALID_REQUEST_BODY: "Geçersiz istek gövdesi",
			SUBSCRIPTION_NOT_FOUND: "Abonelik bulunamadı",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Abonelik planı bulunamadı",
			ALREADY_SUBSCRIBED_PLAN: "Zaten bu plana abonesiniz",
			REFERENCE_ID_NOT_ALLOWED: "Referans kimliğine izin verilmiyor",
			CUSTOMER_NOT_FOUND: "Bu kullanıcı için Stripe müşterisi bulunamadı",
			UNABLE_TO_CREATE_CUSTOMER: "Müşteri oluşturulamadı",
			UNABLE_TO_CREATE_BILLING_PORTAL: "Fatura portalı oturumu oluşturulamadı",
			STRIPE_SIGNATURE_NOT_FOUND: "Stripe imzası bulunamadı",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe webhook sırrı bulunamadı",
			STRIPE_WEBHOOK_ERROR: "Stripe webhook hatası",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Stripe olayı oluşturulamadı",
			FAILED_TO_FETCH_PLANS: "Planlar getirilemedi",
			EMAIL_VERIFICATION_REQUIRED:
				"Bir plana abone olmadan önce e-posta doğrulaması gereklidir",
			SUBSCRIPTION_NOT_ACTIVE: "Abonelik aktif değil",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Abonelik iptal için planlanmamış",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Aboneliğin bekleyen bir iptali veya planlanmış plan değişikliği yok",
			ORGANIZATION_NOT_FOUND: "Organizasyon bulunamadı",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Organizasyon aboneliği etkinleştirilmemiş",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Organizasyon abonelikleri authorizeReference geri çağrısının yapılandırılmasını gerektirir",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Aktif aboneliği olan organizasyon silinemez",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Referans Kimliği gereklidir. referenceId sağlayın veya oturumda activeOrganizationId belirleyin",
		},
		uk: {
			UNAUTHORIZED: "Неавторизований доступ",
			INVALID_REQUEST_BODY: "Некоректне тіло запиту",
			SUBSCRIPTION_NOT_FOUND: "Передплату не знайдено",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Тарифний план не знайдено",
			ALREADY_SUBSCRIBED_PLAN: "Ви вже підписані на цей тариф",
			REFERENCE_ID_NOT_ALLOWED: "Ідентифікатор посилання не дозволено",
			CUSTOMER_NOT_FOUND: "Клієнта Stripe для цього користувача не знайдено",
			UNABLE_TO_CREATE_CUSTOMER: "Не вдалося створити клієнта",
			UNABLE_TO_CREATE_BILLING_PORTAL:
				"Не вдалося створити сесію платіжного порталу",
			STRIPE_SIGNATURE_NOT_FOUND: "Підпис Stripe не знайдено",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Секрет вебхука Stripe не знайдено",
			STRIPE_WEBHOOK_ERROR: "Помилка вебхука Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Не вдалося створити подію Stripe",
			FAILED_TO_FETCH_PLANS: "Не вдалося отримати тарифи",
			EMAIL_VERIFICATION_REQUIRED:
				"Для підписки на тариф необхідне підтвердження електронної пошти",
			SUBSCRIPTION_NOT_ACTIVE: "Передплата не активна",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Скасування передплати не заплановано",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Передплата не має очікуваних скасувань або запланованих змін тарифу",
			ORGANIZATION_NOT_FOUND: "Організацію не знайдено",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Передплата для організації не увімкнена",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Для передплат організації необхідно налаштувати функцію зворотного виклику authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Неможливо видалити організацію з активною передплатою",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"Потрібен ідентифікатор посилання. Вкажіть referenceId або задайте activeOrganizationId в сесії",
		},
		vi: {
			UNAUTHORIZED: "Truy cập không hợp lệ",
			INVALID_REQUEST_BODY: "Yêu cầu không hợp lệ",
			SUBSCRIPTION_NOT_FOUND: "Không tìm thấy gói đăng ký",
			SUBSCRIPTION_PLAN_NOT_FOUND: "Không tìm thấy gói cước",
			ALREADY_SUBSCRIBED_PLAN: "Bạn đã đăng ký gói cước này rồi",
			REFERENCE_ID_NOT_ALLOWED: "ID tham chiếu không được phép",
			CUSTOMER_NOT_FOUND: "Không tìm thấy khách hàng Stripe cho người dùng này",
			UNABLE_TO_CREATE_CUSTOMER: "Không thể tạo khách hàng",
			UNABLE_TO_CREATE_BILLING_PORTAL: "Không thể tạo phiên cổng thanh toán",
			STRIPE_SIGNATURE_NOT_FOUND: "Không tìm thấy chữ ký Stripe",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND:
				"Không tìm thấy mã bảo mật webhook Stripe",
			STRIPE_WEBHOOK_ERROR: "Lỗi webhook Stripe",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Không thể tạo sự kiện Stripe",
			FAILED_TO_FETCH_PLANS: "Tải các gói cước thất bại",
			EMAIL_VERIFICATION_REQUIRED:
				"Cần xác thực email trước khi bạn có thể đăng ký một gói cước",
			SUBSCRIPTION_NOT_ACTIVE: "Gói đăng ký không hoạt động",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"Gói đăng ký không được lên lịch hủy bỏ",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"Gói đăng ký không có yêu cầu hủy hoặc thay đổi gói cước nào đang chờ xử lý",
			ORGANIZATION_NOT_FOUND: "Không tìm thấy tổ chức",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
				"Gói đăng ký tổ chức chưa được kích hoạt",
			AUTHORIZE_REFERENCE_REQUIRED:
				"Gói đăng ký tổ chức yêu cầu cấu hình callback authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"Không thể xóa tổ chức khi đang có gói đăng ký hoạt động",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"ID tham chiếu là bắt buộc. Hãy cung cấp referenceId hoặc đặt activeOrganizationId trong phiên làm việc",
		},
		zh: {
			UNAUTHORIZED: "未授权的访问",
			INVALID_REQUEST_BODY: "请求体无效",
			SUBSCRIPTION_NOT_FOUND: "未找到订阅",
			SUBSCRIPTION_PLAN_NOT_FOUND: "未找到订阅计划",
			ALREADY_SUBSCRIBED_PLAN: "您已订阅此计划",
			REFERENCE_ID_NOT_ALLOWED: "不允许使用引用 ID",
			CUSTOMER_NOT_FOUND: "未找到该用户的 Stripe 客户",
			UNABLE_TO_CREATE_CUSTOMER: "无法创建客户",
			UNABLE_TO_CREATE_BILLING_PORTAL: "无法创建账单门户会话",
			STRIPE_SIGNATURE_NOT_FOUND: "未找到 Stripe 签名",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "未找到 Stripe Webhook 密钥",
			STRIPE_WEBHOOK_ERROR: "Stripe Webhook 错误",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "构建 Stripe 事件失败",
			FAILED_TO_FETCH_PLANS: "获取计划失败",
			EMAIL_VERIFICATION_REQUIRED: "订阅计划前需要验证电子邮件",
			SUBSCRIPTION_NOT_ACTIVE: "订阅未激活",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION: "未计划取消订阅",
			SUBSCRIPTION_NOT_PENDING_CHANGE: "订阅没有待处理的的取消或计划的方案变更",
			ORGANIZATION_NOT_FOUND: "未找到组织",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "组织订阅未启用",
			AUTHORIZE_REFERENCE_REQUIRED: "组织订阅需要配置 authorizeReference 回调",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION: "无法删除拥有活动订阅的组织",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"需要引用 ID。请提供 referenceId 或在会话中设置 activeOrganizationId",
		},
		th: {
			UNAUTHORIZED: "การเข้าถึงไม่ได้รับอนุญาต",
			INVALID_REQUEST_BODY: "เนื้อหาคำขอไม่ถูกต้อง",
			SUBSCRIPTION_NOT_FOUND: "ไม่พบการสมัครสมาชิก",
			SUBSCRIPTION_PLAN_NOT_FOUND: "ไม่พบแผนการสมัครสมาชิก",
			ALREADY_SUBSCRIBED_PLAN: "คุณสมัครแผนบริการนี้อยู่แล้ว",
			REFERENCE_ID_NOT_ALLOWED: "ไม่อนุญาตให้ระบุ Reference ID",
			CUSTOMER_NOT_FOUND: "ไม่พบข้อมูลลูกค้า Stripe สำหรับผู้ใช้นี้",
			UNABLE_TO_CREATE_CUSTOMER: "ไม่สามารถสร้างข้อมูลลูกค้าได้",
			UNABLE_TO_CREATE_BILLING_PORTAL: "ไม่สามารถสร้างเซสชันสำหรับพอร์ทัลชำระเงินได้",
			STRIPE_SIGNATURE_NOT_FOUND: "ไม่พบข้อมูลลายเซ็นของ Stripe",
			STRIPE_WEBHOOK_SECRET_NOT_FOUND: "ไม่พบรหัสความลับของ Stripe webhook",
			STRIPE_WEBHOOK_ERROR: "เกิดข้อผิดพลาดของ Stripe webhook",
			FAILED_TO_CONSTRUCT_STRIPE_EVENT: "การสร้างออบเจกต์เหตุการณ์ Stripe ล้มเหลว",
			FAILED_TO_FETCH_PLANS: "ดึงข้อมูลแผนล้มเหลว",
			EMAIL_VERIFICATION_REQUIRED: "จำเป็นต้องยืนยันอีเมลก่อนที่จะสามารถสมัครสมาชิกแผนได้",
			SUBSCRIPTION_NOT_ACTIVE: "การสมัครสมาชิกไม่มีผลใช้งาน",
			SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
				"ไม่มีกำหนดเวลาสำหรับการยกเลิกการสมัครสมาชิก",
			SUBSCRIPTION_NOT_PENDING_CHANGE:
				"ไม่มีการยกเลิกการสมัครสมาชิกที่รอดำเนินการหรือแผนการเปลี่ยนแผนบริการที่กำหนดเวลาไว้",
			ORGANIZATION_NOT_FOUND: "ไม่พบองค์กร",
			ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "การสมัครสมาชิกขององค์กรไม่ถูกเปิดใช้งาน",
			AUTHORIZE_REFERENCE_REQUIRED:
				"การสมัครสมาชิกขององค์กรต้องได้รับการกำหนดค่าคอลแบ็ก authorizeReference",
			ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
				"ไม่สามารถลบองค์กรที่มีการสมัครสมาชิกที่ใช้งานอยู่ได้",
			ORGANIZATION_REFERENCE_ID_REQUIRED:
				"จำเป็นต้องมีรหัสอ้างอิง โปรดระบุ referenceId หรือกำหนดค่า activeOrganizationId ในเซสชัน",
		},
	};
