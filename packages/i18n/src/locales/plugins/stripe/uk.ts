import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const ukStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
};
