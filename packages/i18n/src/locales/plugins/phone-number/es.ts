import type { PHONE_NUMBER_ERROR_CODES } from "better-auth/plugins/phone-number";
import type { LocalizedTranslations } from "../../../types";

export const esPhoneNumber: LocalizedTranslations<
	typeof PHONE_NUMBER_ERROR_CODES
> = {
	INVALID_PHONE_NUMBER: "Número de teléfono inválido",
	PHONE_NUMBER_EXIST: "El número de teléfono ya existe",
	PHONE_NUMBER_NOT_EXIST: "El número de teléfono no está registrado",
	INVALID_PHONE_NUMBER_OR_PASSWORD: "Número de teléfono o contraseña inválidos",
	UNEXPECTED_ERROR: "Error inesperado",
	OTP_NOT_FOUND: "OTP no encontrado",
	OTP_EXPIRED: "OTP expirado",
	INVALID_OTP: "OTP inválido",
	PHONE_NUMBER_NOT_VERIFIED: "Número de teléfono no verificado",
	PHONE_NUMBER_CANNOT_BE_UPDATED:
		"El número de teléfono no puede ser actualizado",
	SEND_OTP_NOT_IMPLEMENTED: "sendOTP no implementado",
	TOO_MANY_ATTEMPTS: "Demasiados intentos. Por favor, intenta más tarde.",
};
