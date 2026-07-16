import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const esOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"No tienes permitido crear una nueva organización",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Has alcanzado el número máximo de organizaciones",
	ORGANIZATION_ALREADY_EXISTS: "La organización ya existe",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "El slug de la organización ya está en uso",
	ORGANIZATION_NOT_FOUND: "Organización no encontrada",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"El usuario no es miembro de la organización",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"No tienes permitido actualizar esta organización",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"No tienes permitido eliminar esta organización",
	NO_ACTIVE_ORGANIZATION: "No hay organización activa",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"El usuario ya es miembro de esta organización",
	MEMBER_NOT_FOUND: "Miembro no encontrado",
	ROLE_NOT_FOUND: "Rol no encontrado",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"No tienes permitido crear un nuevo equipo",
	TEAM_ALREADY_EXISTS: "El equipo ya existe",
	TEAM_NOT_FOUND: "Equipo no encontrado",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"No puedes dejar la organización como el único propietario",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"No puedes dejar la organización sin un propietario",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"No tienes permitido eliminar a este miembro",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"No tienes permitido invitar usuarios a esta organización",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"El usuario ya está invitado a esta organización",
	INVITATION_NOT_FOUND: "Invitación no encontrada",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"No eres el destinatario de la invitación",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Se requiere verificación de correo electrónico antes de aceptar o rechazar la invitación",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Se requiere verificación de correo electrónico para ver invitaciones",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"No tienes permitido cancelar esta invitación",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"El invitador ya no es miembro de la organización",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"No tienes permitido invitar a un usuario con este rol",
	FAILED_TO_RETRIEVE_INVITATION: "Error al recuperar la invitación",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Has alcanzado el número máximo de equipos",
	UNABLE_TO_REMOVE_LAST_TEAM: "No se puede eliminar el último equipo",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"No tienes permitido actualizar a este miembro",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Límite de miembros de la organización alcanzado",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"No tienes permitido crear equipos en esta organización",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"No tienes permitido eliminar equipos en esta organización",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"No tienes permitido actualizar este equipo",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"No tienes permitido eliminar este equipo",
	INVITATION_LIMIT_REACHED: "Límite de invitaciones alcanzado",
	TEAM_MEMBER_LIMIT_REACHED: "Límite de miembros del equipo alcanzado",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "El usuario no es miembro del equipo",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"No tienes permitido listar los miembros de este equipo",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "No tienes un equipo activo",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"No tienes permitido crear un nuevo miembro",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"No tienes permitido eliminar un miembro del equipo",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"No tienes permitido acceder a esta organización como propietario",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"No eres miembro de esta organización",
	MISSING_AC_INSTANCE:
		"El Control de Acceso Dinámico requiere una instancia ac predefinida en el plugin del servidor",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Debes estar en una organización para crear un rol",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE: "No tienes permitido crear un rol",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE: "No tienes permitido actualizar un rol",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE: "No tienes permitido eliminar un rol",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE: "No tienes permitido leer un rol",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE: "No tienes permitido listar un rol",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE: "No tienes permitido obtener un rol",
	TOO_MANY_ROLES: "Esta organización tiene demasiados roles",
	INVALID_RESOURCE: "El permiso proporcionado incluye un recurso inválido",
	ROLE_NAME_IS_ALREADY_TAKEN: "Ese nombre de rol ya está en uso",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE: "No se puede eliminar un rol predefinido",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"No se puede eliminar un rol asignado a miembros. Por favor, reasigna a los miembros a un rol diferente primero",
	INVALID_TEAM_ID: "El ID del equipo contiene un carácter reservado",
};
