import type { USERNAME_ERROR_CODES } from "better-auth/plugins/username";
import type { LocalizedTranslations } from "../../../types";

export const ptUsername: LocalizedTranslations<typeof USERNAME_ERROR_CODES> = {
	INVALID_USERNAME_OR_PASSWORD: "Nome de usuário ou senha inválidos",
	EMAIL_NOT_VERIFIED: "E-mail não verificado",
	UNEXPECTED_ERROR: "Erro inesperado",
	USERNAME_IS_ALREADY_TAKEN:
		"Este nome de usuário já está em uso. Por favor, tente outro.",
	USERNAME_TOO_SHORT: "O nome de usuário é curto demais",
	USERNAME_TOO_LONG: "O nome de usuário é longo demais",
	INVALID_USERNAME: "Nome de usuário inválido",
	INVALID_DISPLAY_USERNAME: "Nome de exibição inválido",
	USERNAME_IS_IMMUTABLE: "O nome de usuário não pode ser atualizado",
};
