import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const ptPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Número de telefone inválido",
	PHONE_NUMBER_EXIST: "Número de telefone já existe",
	PHONE_NUMBER_NOT_EXIST: "Número de telefone não está registrado",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Número de telefone ou senha inválidos",
	UNEXPECTED_ERROR: "Erro inesperado",
	OTP_NOT_FOUND: "OTP não encontrado",
	OTP_EXPIRED: "OTP expirou",
	INVALID_OTP: "OTP inválido",
	PHONE_NUMBER_NOT_VERIFIED: "Número de telefone não verificado",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"O número de telefone não pode ser atualizado",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP não implementado",
	TOO_MANY_ATTEMPTS:
		"Tentativas demais. Por favor, tente novamente mais tarde.",
};
