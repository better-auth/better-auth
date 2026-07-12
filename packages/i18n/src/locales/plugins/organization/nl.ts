import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const nlOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Je bent nicht gemachtigd om een nieuwe organisatie aan te maken",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Je hebt het maximum aantal organisaties bereikt",
	ORGANIZATION_ALREADY_EXISTS: "Organisatie bestaat al",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Organisatie-slug is al in gebruik",
	ORGANIZATION_NOT_FOUND: "Organisatie niet gevonden",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"Gebruiker is geen lid van de organisatie",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Je bent niet gemachtigd om deze organisatie bij te werken",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Je bent niet gemachtigd om deze organisatie te verwijderen",
	NO_ACTIVE_ORGANIZATION: "Geen actieve organisatie",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Gebruiker is al lid van deze organisatie",
	MEMBER_NOT_FOUND: "Lid niet gevonden",
	ROLE_NOT_FOUND: "Rol niet gevonden",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"Je bent niet gemachtigd om een nieuw team aan te maken",
	TEAM_ALREADY_EXISTS: "Team bestaat al",
	TEAM_NOT_FOUND: "Team niet gevonden",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Je kunt de organisatie niet verlaten als de enige eigenaar",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Je kunt de organisatie niet verlaten zonder een eigenaar",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Je bent niet gemachtigd om dit lid te verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Je bent niet gemachtigd om gebruikers uit te nodigen voor deze organisatie",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Gebruiker is al uitgenodigd voor deze organisatie",
	INVITATION_NOT_FOUND: "Uitnodiging niet gevonden",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Je bent niet de ontvanger van de uitnodiging",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"E-mailverificatie vereist voordat uitnodiging kan worden geaccepteerd of geweigerd",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"E-mailverificatie vereist om uitnodigingen te bekijken",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Je bent niet gemachtigd om deze uitnodiging te annuleren",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"De uitnodiger is geen lid meer van de organisatie",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Je bent niet gemachtigd om een gebruiker met deze rol uit te nodigen",
	FAILED_TO_RETRIEVE_INVITATION: "Mislukt om uitnodiging op te halen",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Je hebt het maximum aantal teams bereikt",
	UNABLE_TO_REMOVE_LAST_TEAM: "Onmogelijk om het laatste team te verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Je bent niet gemachtigd om dit lid bij te werken",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Limiet voor organisatielidmaatschappen bereikt",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Je bent niet gemachtigd om teams in deze organisatie aan te maken",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Je bent niet gemachtigd om teams in deze organisatie te verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Je bent niet gemachtigd om dit team bij te werken",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"Je bent niet gemachtigd om dit team te verwijderen",
	INVITATION_LIMIT_REACHED: "Uitnodigingslimiet bereikt",
	TEAM_MEMBER_LIMIT_REACHED: "Limiet voor teamleden bereikt",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Gebruiker is geen lid van het team",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Je bent niet gemachtigd om de leden van dit team te tonen",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Je hebt geen actief team",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Je bent niet gemachtigd om een nieuw lid aan te maken",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Je bent niet gemachtigd om een teamlid te verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Je bent niet gemachtigd om toegang te krijgen tot deze organisatie als eigenaar",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Je bent geen lid van deze organisatie",
	MISSING_AC_INSTANCE:
		"Dynamische toegangscontrole vereist een vooraf gedefinieerde ac-instantie op de serverauth-plugin",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Je moet in een organisatie zijn om een rol te creëren",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
		"Je bent niet gemachtigd om een rol te creëren",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"Je bent niet gemachtigd om een rol bij te werken",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
		"Je bent nicht gemachtigd om een rol te verwijderen",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
		"Je bent niet gemachtigd om een rol te lezen",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
		"Je bent niet gemachtigd om een rol te tonen",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
		"Je bent niet gemachtigd om een rol op te halen",
	TOO_MANY_ROLES: "Deze organisatie heeft te veel rollen",
	INVALID_RESOURCE: "De opgegeven machtiging bevat een ongeldige bron",
	ROLE_NAME_IS_ALREADY_TAKEN: "Die rolnaam is al in gebruik",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE:
		"Kan een vooraf gedefinieerde rol niet verwijderen",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Kan een rol die aan leden is toegewezen niet verwijderen. Wijs de leden eerst aan een andere rol toe",
	INVALID_TEAM_ID: "Team-id bevat een gereserveerd teken",
};
