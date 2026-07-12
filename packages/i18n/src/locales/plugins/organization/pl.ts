import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const plOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Nie masz uprawnień do tworzenia nowej organizacji",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Ociągnąłeś maksymalną liczbę organizacji",
	ORGANIZATION_ALREADY_EXISTS: "Organizacja już istnieje",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "Ten slug organizacji jest już zajęty",
	ORGANIZATION_NOT_FOUND: "Organizacja nie została znaleziona",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"Użytkownik nie jest członkiem organizacji",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Nie masz uprawnień do aktualizowania tej organizacji",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Nie masz uprawnień do usuwania tej organizacji",
	NO_ACTIVE_ORGANIZATION: "Brak aktywnej organizacji",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"Użytkownik jest już członkiem tej organizacji",
	MEMBER_NOT_FOUND: "Członek nie został znaleziony",
	ROLE_NOT_FOUND: "Rola nie została znaleziona",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"Nie masz uprawnień do tworzenia nowego zespołu",
	TEAM_ALREADY_EXISTS: "Zespół już istnieje",
	TEAM_NOT_FOUND: "Zespół nie został znaleziony",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Nie możesz opuścić organizacji jako jej jedyny właściciel",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Nie możesz opuścić organizacji bez właściciela",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Nie masz uprawnień do usunięcia tego członka",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Nie masz uprawnień do zapraszania użytkowników do tej organizacji",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"Użytkownik został już zaproszony do tej organizacji",
	INVITATION_NOT_FOUND: "Zaproszenie nie zostało znalezione",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Nie jesteś odbiorcą tego zaproszenia",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Przed zaakceptowaniem lub odrzuceniem zaproszenia wymagana jest weryfikacja adresu e-mail",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Wymagana weryfikacja adresu e-mail, aby zobaczyć zaproszenia",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Nie masz uprawnień do anulowania tego zaproszenia",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"Zapraszający nie jest już członkiem organizacji",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Nie masz uprawnień do zaproszenia użytkownika z tą rolą",
	FAILED_TO_RETRIEVE_INVITATION: "Nie udało się pobrać zaproszenia",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Ociągnąłeś maksymalną liczbę zespołów",
	UNABLE_TO_REMOVE_LAST_TEAM: "Nie można usunąć ostatniego zespołu",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Nie masz uprawnień do aktualizowania tego członka",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Ociągnięto limit członków organizacji",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Nie masz uprawnień do tworzenia zespołów w tej organizacji",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Nie masz uprawnień do usuwania zespołów w tej organizacji",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Nie masz uprawnień do aktualizowania tego zespołu",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"Nie masz uprawnień do usunięcia tego zespołu",
	INVITATION_LIMIT_REACHED: "Ociągnięto limit zaproszeń",
	TEAM_MEMBER_LIMIT_REACHED: "Ociągnięto limit członków zespołu",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "Użytkownik nie jest członkiem zespołu",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Nie masz uprawnień do wyświetlania członków tego zespołu",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Nie masz aktywnego zespołu",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Nie masz uprawnień do tworzenia nowego członka",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Nie masz uprawnień do usunięcia członka zespołu",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Nie masz uprawnień dostępu do tej organizacji jako właściciel",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Nie jesteś członkiem tej organizacji",
	MISSING_AC_INSTANCE:
		"Dynamiczna kontrola dostępu wymaga zdefiniowanej instancji ac w pluginie serwera",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Musisz być w organizacji, aby utworzyć rolę",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "Nie masz uprawnień do tworzenia roli",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"Nie masz uprawnień do modyfikowania roli",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "Nie masz uprawnień do usuwania roli",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "Nie masz uprawnień do odczytywania roli",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "Nie masz uprawnień do listowania roli",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "Nie masz uprawnień do pobierania roli",
	TOO_MANY_ROLES: "Ta organizacja posiada zbyt wiele ról",
	INVALID_RESOURCE: "Podane uprawnienie zawiera nieprawidłowy zasób",
	ROLE_NAME_IS_ALREADY_TAKEN: "Nazwa roli jest już zajęta",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "Nie można usunąć roli wbudowanej",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Nie można usunąć roli przypisanej do członków. Proszę najpierw przypisać członków do innej roli",
	INVALID_TEAM_ID: "ID zespołu zawiera zarezerwowany znak",
};
