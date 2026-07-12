import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const jaStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe Webhookシークレットが見つかりません",
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
};
