import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const ruStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Неавторизованный доступ",
	INVALID_REQUEST_BODY: "Неверное тело запроса",
	SUBSCRIPTION_NOT_FOUND: "Подписка не найдена",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Тарифный план не найден",
	ALREADY_SUBSCRIBED_PLAN: "Вы уже подписаны на этот тариф",
	REFERENCE_ID_NOT_ALLOWED: "Идентификатор ссылки не разрешен",
	CUSTOMER_NOT_FOUND: "Клиент Stripe для этого пользователя не найден",
	UNABLE_TO_CREATE_CUSTOMER: "Не удалось создать клиента",
	UNABLE_TO_CREATE_BILLING_PORTAL: "Не удалось создать сессию портала оплаты",
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
};
