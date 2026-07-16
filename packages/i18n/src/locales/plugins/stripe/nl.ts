import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const nlStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
};
