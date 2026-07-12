import type { STRIPE_ERROR_CODES } from "@better-auth/stripe";
import type { LocalizedTranslations } from "../../../types";

export const frStripe: LocalizedTranslations<typeof STRIPE_ERROR_CODES> = {
	UNAUTHORIZED: "Accès non autorisé",
	INVALID_REQUEST_BODY: "Corps de requête invalide",
	SUBSCRIPTION_NOT_FOUND: "Abonnement non trouvé",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Plan d'abonnement non trouvé",
	ALREADY_SUBSCRIBED_PLAN: "Vous êtes déjà abonné à ce plan",
	REFERENCE_ID_NOT_ALLOWED: "L'ID de référence n'est pas autorisé",
	CUSTOMER_NOT_FOUND: "Client Stripe non trouvé pour cet utilisateur",
	UNABLE_TO_CREATE_CUSTOMER: "Impossible de créer le client",
	UNABLE_TO_CREATE_BILLING_PORTAL:
		"Impossible de créer la session du portail de facturation",
	STRIPE_SIGNATURE_NOT_FOUND: "Signature Stripe non trouvée",
	STRIPE_WEBHOOK_SECRET_NOT_FOUND: "Secret du webhook Stripe non trouvé",
	STRIPE_WEBHOOK_ERROR: "Erreur de webhook Stripe",
	FAILED_TO_CONSTRUCT_STRIPE_EVENT:
		"Échec de la construction de l'événement Stripe",
	FAILED_TO_FETCH_PLANS: "Échec de la récupération des plans",
	EMAIL_VERIFICATION_REQUIRED:
		"La vérification de l'adresse e-mail est requise avant de pouvoir vous abonner à un plan",
	SUBSCRIPTION_NOT_ACTIVE: "L'abonnement n'est pas actif",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"L'abonnement n'est pas programmé pour annulation",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"L'abonnement n'a aucune annulation en attente ni changement de plan programmé",
	ORGANIZATION_NOT_FOUND: "Organisation non trouvée",
	ORGANIZATION_SUBSCRIPTION_NOT_ENABLED:
		"L'abonnement d'organisation n'est pas activé",
	AUTHORIZE_REFERENCE_REQUIRED:
		"Les abonnements d'organisation nécessitent la configuration du rappel authorizeReference",
	ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION:
		"Impossible de supprimer une organisation avec un abonnement actif",
	ORGANIZATION_REFERENCE_ID_REQUIRED:
		"L'ID de référence est requis. Fournissez referenceId ou définissez activeOrganizationId dans la session",
};
