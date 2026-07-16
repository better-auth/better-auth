import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const esStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Error al construir el evento de Stripe",
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
};
