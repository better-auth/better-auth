import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const itStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Accesso non autorizzato",
	INVALID_REQUEST_BODY: "Corpo della richiesta non valido",
	SUBSCRIPTION_NOT_FOUND: "Abbonamento non trovato",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Piano di abbonamento non trovato",
	ALREADY_SUBSCRIBED_PLAN: "Sei già iscritto a questo piano",
	REFERENCE_ID_NOT_ALLOWED: "L'ID di riferimento non è consentito",
	CUSTOMER_NOT_FOUND: "Cliente Stripe non trovato per questo utente",
	UNABLE_TO_CREATE_CUSTOMER: "Impossibile creare il cliente",
	UNABLE_TO_CREATE_BILLING_PORTAL:
		"Impossibile creare la sessione del portale di fatturazione",
	STRIPE_SIGNATURE_NOT_FOUND: "Firma di Stripe non trovata",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Segreto del webhook di Stripe non trovato",
	STRIPE_WEBHOOK_ERROR: "Errore del webhook di Stripe",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Impossibile costruire l'evento di Stripe",
	FAILED_TO_FETCH_PLANS: "Impossibile recuperare i piani",
	EMAIL_VERIFICATION_REQUIRED:
		"La verifica dell'e-mail è richiesta prima di potersi abbonare a un piano",
	SUBSCRIPTION_NOT_ACTIVE: "L'abbonamento non è attivo",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"L'abbonamento non è programmato per la cancellazione",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"L'abbonamento non ha alcuna cancellazione in sospeso o cambio di piano programmato",
	ORGANIZATION_NOT_FOUND: "Organizzazione non trovata",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"L'abbonamento dell'organizzazione non è abilitato",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Gli abbonamenti dell'organizzazione richiedono la configurazione della callback authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Impossibile eliminare l'organizzazione con un abbonamento attivo",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"L'ID di riferimento è richiesto. Fornisci referenceId o imposta activeOrganizationId nella sessione",
};
