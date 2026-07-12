import type { ANONYMOUS_ERROR_CODES } from "better-auth/plugins/anonymous";
import type { LocalizedTranslations } from "../../../types";

export const ptAnonymous: LocalizedTranslations<typeof ANONYMOUS_ERROR_CODES> =
	{
		INVALID_EMAIL_FORMAT: "E-mail não foi gerado em um formato válido",
		FAILED_TO_CREATE_USER: "Falha ao criar usuário",
		COULD_NOT_CREATE_SESSION: "Não foi possível criar a sessão",
		ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY:
			"Usuários anônimos não podem entrar anonimamente novamente",
		FAILED_TO_DELETE_ANONYMOUS_USER: "Falha ao excluir usuário anônimo",
		FAILED_TO_DELETE_ANONYMOUS_USER_SESSIONS:
			"Falha ao excluir sessões de usuário anônimo",
		USER_IS_NOT_ANONYMOUS: "O usuário não é anônimo",
		DELETE_ANONYMOUS_USER_DISABLED:
			"A exclusão de usuários anônimos está desativada",
	};
