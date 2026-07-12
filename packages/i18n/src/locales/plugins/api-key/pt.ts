import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const ptApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "os metadados devem ser um objeto ou indefinidos",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillAmount é obrigatório quando refillInterval é fornecido",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillInterval é obrigatório quando refillAmount é fornecido",
	USER_BANNED: "Usuário banido",
	UNAUTHORIZED_SESSION: "Sessão não autorizada ou inválida",
	KEY_NOT_FOUND: "Chave API não encontrada",
	KEY_DISABLED: "Chave API está desativada",
	KEY_EXPIRED: "Chave API expirou",
	USAGE_EXCEEDED: "A chave API atingiu seu limite de uso",
	KEY_NOT_RECOVERABLE: "A chave API não é recuperável",
	EXPIRES_IN_IS_TOO_SMALL:
		"O valor de expiresIn é menor do que o mínimo predefinido.",
	EXPIRES_IN_IS_TOO_LARGE:
		"O valor de expiresIn é maior do que o máximo predefinido.",
	INVALID_REMAINING: "A contagem restante é muito grande ou muito pequena.",
	INVALID_PREFIX_LENGTH:
		"O comprimento do prefixo é muito grande ou muito pequeno.",
	INVALID_NAME_LENGTH: "O comprimento do nome é muito grande ou muito pequeno.",
	METADATA_DISABLED: "Os metadados estão desativados.",
	RATE_LIMIT_EXCEEDED: "Limite de taxa excedido.",
	NO_VALUES_TO_UPDATE: "Não há valores para atualizar.",
	KEY_DISABLED_EXPIRATION:
		"Valores personalizados de expiração de chave estão desativados.",
	INVALID_API_KEY: "Chave API inválida.",
	INVALID_USER_ID_FROM_API_KEY: "O ID do usuário da chave API é inválido.",
	INVALID_REFERENCE_ID_FROM_API_KEY:
		"O ID de referência da chave API é inválido.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"O getter da chave API retornou um tipo inválido. Esperado string.",
	SERVER_ONLY_PROPERTY:
		"A propriedade que você está tentando configurar só pode ser definida a partir da instância de referência do servidor.",
	FAILED_TO_UPDATE_API_KEY: "Falha ao atualizar a chave API",
	NAME_REQUIRED: "O nome da chave API é obrigatório.",
	ORGANIZATION_ID_REQUIRED:
		"O ID da organização é obrigatório para chaves API pertencentes à organização.",
	USER_NOT_MEMBER_OF_ORGANIZATION:
		"Você não é um membro da organização proprietária desta chave API.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"Você não tem permissão para realizar esta ação em chaves API da organização.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"Nenhuma configuração padrão de chave API encontrada.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"O plugin de organização é necessário para chaves API pertencentes à organização. Instale e configure o plugin de organização.",
};
