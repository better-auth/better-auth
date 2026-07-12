import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const svStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
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
};
