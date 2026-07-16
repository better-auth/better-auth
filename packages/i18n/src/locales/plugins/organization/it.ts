import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const itOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Non sei autorizzato a creare una nuova organizzazione",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Hai raggiunto il numero massimo di organizzazioni",
	ORGANIZATION_ALREADY_EXISTS: "L'organizzazione esiste già",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Slug dell'organizzazione già utilizzato",
	ORGANIZATION_NOT_FOUND: "Organizzazione non trovata",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"L'utente non è un membro dell'organizzazione",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Non sei autorizzato ad aggiornare questa organizzazione",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Non sei autorizzato a eliminare questa organizzazione",
	NO_ACTIVE_ORGANIZATION: "Nessuna organizzazione attiva",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"L'utente è già membro di questa organizzazione",
	MEMBER_NOT_FOUND: "Membro non trovato",
	ROLE_NOT_FOUND: "Ruolo non trovato",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"Non sei autorizzato a creare un nuovo team",
	TEAM_ALREADY_EXISTS: "Il team esiste già",
	TEAM_NOT_FOUND: "Team non trovato",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Non puoi lasciare l'organizzazione come unico proprietario",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Non puoi lasciare l'organizzazione senza un proprietario",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Non sei autorizzato a eliminare questo membro",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Non sei autorizzato a invitare utenti in questa organizzazione",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"L'utente è già invitato in questa organizzazione",
	INVITATION_NOT_FOUND: "Invito non trovato",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Non sei il destinatario dell'invito",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Verifica e-mail richiesta prima di accettare o rifiutare l'invito",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Verifica e-mail richiesta per visualizzare gli inviti",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Non sei autorizzato a cancellare questo invito",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Chi ha invitato non è più membro dell'organizzazione",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Non sei autorizzato a invitare un utente con questo ruolo",
	FAILED_TO_RETRIEVE_INVITATION: "Impossibile recuperare l'invito",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Hai raggiunto il numero massimo di team",
	UNABLE_TO_REMOVE_LAST_TEAM: "Impossibile rimuovere l'ultimo team",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Non sei autorizzato ad aggiornare questo membro",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Limite di membri dell'organizzazione raggiunto",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Non sei autorizzato a creare team in questa organizzazione",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Non sei autorizzato a eliminare team in questa organizzazione",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Non sei autorizzato ad aggiornare questo team",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"Non sei autorizzato a eliminare questo team",
	INVITATION_LIMIT_REACHED: "Limite di inviti raggiunto",
	TEAM_MEMBER_LIMIT_REACHED: "Limite di membri del team raggiunto",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "L'utente non è membro del team",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Non sei autorizzato a elencare i membri di questo team",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Non hai un team attivo",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Non sei autorizzato a creare un nuovo membro",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Non sei autorizzato a rimuovere un membro del team",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Non sei autorizzato ad accedere a questa organizzazione come proprietario",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Non sei membro di questa organizzazione",
	MISSING_AC_INSTANCE:
		"Il Controllo Accessi Dinamico richiede un'istanza ac predefinita sul plugin del server",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Devi essere in un'organizzazione per creare un ruolo",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "Non sei autorizzato a creare un ruolo",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"Non sei autorizzato a aggiornare un ruolo",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
		"Non sei autorizzato a eliminare un ruolo",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "Non sei autorizzato a leggere un ruolo",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "Non sei autorizzato a elencare un ruolo",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "Non sei autorizzato a ottenere un ruolo",
	TOO_MANY_ROLES: "Questa organizzazione ha troppi ruoli",
	INVALID_RESOURCE: "La permissione fornita include una risorsa non valida",
	ROLE_NAME_IS_ALREADY_TAKEN: "Questo nome di ruolo è già in uso",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE:
		"Impossibile eliminare un ruolo predefinito",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Impossibile eliminare un ruolo assegnato ai membri. Si prega di riassegnare prima i membri a un ruolo diverso",
	INVALID_TEAM_ID: "L'ID del team contiene un carattere riservato",
};
