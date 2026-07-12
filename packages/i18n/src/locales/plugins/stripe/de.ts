import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const deStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Stripe-Webhook-Geheimnis nicht gefunden",
	STRIPE_WEBHOOK_ERROR: "Stripe-Webhook-Fehler",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Stripe-Event konnte nicht erstellt werden",
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
};
