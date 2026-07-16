import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const zhStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
};
