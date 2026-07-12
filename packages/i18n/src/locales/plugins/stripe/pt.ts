import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const ptStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Segredo do webhook Stripe não encontrado",
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
};
