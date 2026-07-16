import type { ADMIN_ERROR_CODES } from "better-auth/plugins/admin";
import type { LocalizedTranslations } from "../../../types";

export const ptAdmin: LocalizedTranslations<typeof ADMIN_ERROR_CODES> = {
	FAILED_TO_CREATE_USER: "Falha ao criar usuário",
	USER_ALREADY_EXISTS: "Usuário já existe.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Usuário já existe. Use outro e-mail.",
	YOU_CANNOT_BAN_YOURSELF: "Você não pode banir a si mesmo",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"Você não tem permissão para alterar a função dos usuários",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS:
		"Você não tem permissão para criar usuários",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS:
		"Você não tem permissão para listar usuários",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"Você não tem permissão para listar sessões de usuários",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS:
		"Você não tem permissão para banir usuários",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"Você não tem permissão para personificar usuários",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"Você não tem permissão para revogar sessões de usuários",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS:
		"Você não tem permissão para excluir usuários",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"Você não tem permissão para definir a senha dos usuários",
	BANNED_USER: "Você foi banido desta aplicação",
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "Você não tem permissão para obter usuário",
	NO_DATA_TO_UPDATE: "Nenhum dado para atualizar",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS:
		"Você não tem permissão para atualizar usuários",
	YOU_CANNOT_REMOVE_YOURSELF: "Você não pode remover a si mesmo",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"Você não tem permissão para definir um valor de função inexistente",
	YOU_CANNOT_IMPERSONATE_ADMINS: "Você não pode se passar por administradores",
	INVALID_ROLE_TYPE: "Tipo de função inválido",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_EMAIL:
		"Você não tem permissão para atualizar o e-mail dos usuários",
	PASSWORD_CANNOT_BE_UPDATED_VIA_UPDATE_USER:
		"A senha não pode ser atualizada através da atualização de usuário. Use o ponto de extremidade set-user-password",
};
