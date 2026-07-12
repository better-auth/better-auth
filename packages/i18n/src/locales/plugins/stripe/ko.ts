import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const koStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Stripe 이벤트를 구성하는 데 실패했습니다",
	FAILED_TO_FETCH_PLANS: "요금제를 가져오는 데 실패했습니다",
	EMAIL_VERIFICATION_REQUIRED: "요금제를 구독하려면 이메일 인증이 필요합니다",
	SUBSCRIPTION_NOT_ACTIVE: "구독이 활성화 상태가 아닙니다",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"구독 해지가 예약되어 있지 않습니다",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"구독에 대기 중인 해지나 예약된 요금제 변경이 없습니다",
	ORGANIZATION_NOT_FOUND: "조직을 찾을 수 없습니다",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED: "조직 구독이 활성화되어 있지 않습니다",
	AUTHORIZE_REFERENCE_REQUIRED:
		"조직 구독 설정을 위해서는 authorizeReference 콜백을 설정해야 합니다",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"활성화된 구독이 있는 조직은 삭제할 수 없습니다",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"참조 ID가 필요합니다. referenceId를 제공하거나 세션에 activeOrganizationId를 설정해 주세요",
};
