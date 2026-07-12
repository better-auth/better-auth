import type { PASSKEY_ERROR_CODES } from "@better-auth/passkey";
import type { LocalizedTranslations } from "../../../types";

export const ptPasskey: LocalizedTranslations<typeof PASSKEY_ERROR_CODES> = {
	CHALLENGE_NOT_FOUND: "Desafio não encontrado",
	YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
		"Você não tem permissão para registrar esta passkey",
	FAILED_TO_VERIFY_REGISTRATION: "Falha ao verificar o registro",
	PASSKEY_NOT_FOUND: "Passkey não encontrada",
	AUTHENTICATION_FAILED: "Falha na autenticação",
	UNABLE_TO_CREATE_SESSION: "Não foi possível criar a sessão",
	FAILED_TO_UPDATE_PASSKEY: "Falha ao atualizar a passkey",
	PREVIOUSLY_REGISTERED: "Registrado anteriormente",
	REGISTRATION_CANCELLED: "Registro cancelado",
	AUTH_CANCELLED: "Autenticação cancelada",
	UNKNOWN_ERROR: "Erro desconhecido",
	SESSION_REQUIRED: "O registro da passkey requer uma sessão autenticada",
	RESOLVE_USER_REQUIRED:
		"O registro da passkey requer uma sessão autenticada ou um callback resolveUser quando requireSession é falso",
	RESOLVED_USER_INVALID: "Usuário resolvido é inválido",
};
