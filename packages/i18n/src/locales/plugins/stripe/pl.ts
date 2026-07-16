import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const plStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Nieautoryzowany dostęp",
	INVALID_REQUEST_BODY: "Nieprawidłowa treść zapytania",
	SUBSCRIPTION_NOT_FOUND: "Nie znaleziono subskrypcji",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Nie znaleziono planu subskrypcji",
	ALREADY_SUBSCRIBED_PLAN: "Już subskrybujesz ten plan",
	REFERENCE_ID_NOT_ALLOWED: "Identyfikator referencyjny jest niedozwolony",
	CUSTOMER_NOT_FOUND: "Nie znaleziono klienta Stripe dla tego użytkownika",
	UNABLE_TO_CREATE_CUSTOMER: "Nie można utworzyć klienta",
	UNABLE_TO_CREATE_BILLING_PORTAL:
		"Nie można utworzyć sesji portalu rozliczeniowego",
	STRIPE_SIGNATURE_NOT_FOUND: "Nie znaleziono podpisu Stripe",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND:
		"Nie znaleziono klucza tajnego webhooka Stripe",
	STRIPE_WEBHOOK_ERROR: "Błąd webhooka Stripe",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT: "Nie udało się utworzyć zdarzenia Stripe",
	FAILED_TO_FETCH_PLANS: "Nie udało się pobrać planów",
	EMAIL_VERIFICATION_REQUIRED:
		"Wymagana jest weryfikacja adresu e-mail przed subskrypcją planu",
	SUBSCRIPTION_NOT_ACTIVE: "Subskrypcja nie jest aktywna",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Anulowanie subskrypcji nie jest zaplanowane",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Subskrypcja nie ma oczekującego anulowania ani zaplanowanej zmiany planu",
	ORGANIZATION_NOT_FOUND: "Nie znaleziono organizacji",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"Subskrypcja organizacji nie jest włączona",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Subskrypcje organizacji wymagają skonfigurowania wywołania zwrotnego authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Nie można usunąć organizacji z aktywną subskrypcją",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"Wymagany jest identyfikator referencyjny. Podaj referenceId lub ustaw activeOrganizationId w sesji",
};
