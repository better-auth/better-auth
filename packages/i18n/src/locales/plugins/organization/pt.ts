import type { ORGANIZATION_ERROR_CODES } from "better-auth/plugins/organization";
import type { LocalizedTranslations } from "../../../types";

export const ptOrganization: LocalizedTranslations<
	typeof ORGANIZATION_ERROR_CODES
> = {
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
		"Você não tem permissão para criar uma nova organização",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
		"Você atingiu o número máximo de organizações",
	ORGANIZATION_ALREADY_EXISTS: "A organização já existe",
	ORGANIZATION_SLUG_ALREADY_TAKEN: "O slug da organização já está em uso",
	ORGANIZATION_NOT_FOUND: "Organização não encontrada",
	USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION:
		"O usuário não é membro da organização",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
		"Você não tem permissão para atualizar esta organização",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
		"Você não tem permissão para excluir esta organização",
	NO_ACTIVE_ORGANIZATION: "Nenhuma organização ativa",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
		"O usuário já é membro desta organização",
	MEMBER_NOT_FOUND: "Membro não encontrado",
	ROLE_NOT_FOUND: "Função não encontrada",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM:
		"Você não tem permissão para criar uma nova equipe",
	TEAM_ALREADY_EXISTS: "A equipe já existe",
	TEAM_NOT_FOUND: "Equipe não encontrada",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"Você não pode deixar a organização sendo o único proprietário",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
		"Você não pode deixar a organização sem um proprietário",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
		"Você não tem permissão para excluir este membro",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
		"Você não tem permissão para convidar usuários para esta organização",
	USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
		"O usuário já foi convidado para esta organização",
	INVITATION_NOT_FOUND: "Convite não encontrado",
	YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
		"Você não é o destinatário do convite",
	EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
		"Verificação de e-mail necessária antes de aceitar ou rejeitar o convite",
	EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
		"Verificação de e-mail necessária para visualizar os convites",
	YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
		"Você não tem permissão para cancelar este convite",
	INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
		"O convidando não é mais membro da organização",
	YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
		"Você não tem permissão para convidar um usuário com esta função",
	FAILED_TO_RETRIEVE_INVITATION: "Falha ao recuperar o convite",
	YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS:
		"Você atingiu o número máximo de equipes",
	UNABLE_TO_REMOVE_LAST_TEAM: "Não é possível remover a última equipe",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
		"Você não tem permissão para atualizar este membro",
	ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
		"Limite de membros da organização atingido",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION:
		"Você não tem permissão para criar equipes nesta organização",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION:
		"Você não tem permissão para excluir equipes nesta organização",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM:
		"Você não tem permissão para atualizar esta equipe",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM:
		"Você não tem permissão para excluir esta equipe",
	INVITATION_LIMIT_REACHED: "Limite de convites atingido",
	TEAM_MEMBER_LIMIT_REACHED: "Limite de membros da equipe atingido",
	USER_IS_NOT_A_MEMBER_OF_THE_TEAM: "O usuário não é membro da equipe",
	YOU_CAN_NOT_ACCESS_THE_MEMBERS_OF_THIS_TEAM:
		"Você não tem permissão para listar os membros desta equipe",
	YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM: "Você não tem uma equipe ativa",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER:
		"Você não tem permissão para criar um novo membro",
	YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER:
		"Você não tem permissão para remover um membro da equipe",
	YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
		"Você não tem permissão para acessar esta organização como proprietário",
	YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
		"Você não é membro desta organização",
	MISSING_AC_INSTANCE:
		"O Controle de Acesso Dinâmico requer uma instância ac predefinida no plugin do servidor",
	YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE:
		"Você deve estar em uma organização para criar uma função",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE:
		"Você não tem permissão para criar uma função",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE:
		"Você não tem permissão para atualizar uma função",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE:
		"Você não tem permissão para excluir uma função",
	YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE:
		"Você não tem permissão para ler uma função",
	YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE:
		"Você não tem permissão para listar funções",
	YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE:
		"Você não tem permissão para obter uma função",
	TOO_MANY_ROLES: "Esta organização tem funções demais",
	INVALID_RESOURCE: "A permissão fornecida inclui um recurso inválido",
	ROLE_NAME_IS_ALREADY_TAKEN: "Esse nome de função já está em uso",
	CANNOT_DELETE_A_PRE_DEFINED_ROLE:
		"Não é possível excluir uma função predefinida",
	ROLE_IS_ASSIGNED_TO_MEMBERS:
		"Não é possível excluir uma função que está atribuída a membros. Por favor, reatribua os membros a uma função diferente primeiro",
	INVALID_TEAM_ID: "O ID da equipe contém um caractere reservado",
};
