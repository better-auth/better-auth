import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const ptDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Código de dispositivo inválido",
	EXPIRED_DEVICE_CODE: "O código do dispositivo expirou",
	EXPIRED_USER_CODE: "O código do usuário expirou",
	AUTHORIZATION_PENDING: "Autorização pendente",
	ACCESS_DENIED: "Acesso negado",
	INVALID_USER_CODE: "Código de usuário inválido",
	DEVICE_CODE_ALREADY_PROCESSED: "Código do dispositivo já processado",
	DEVICE_CODE_NOT_CLAIMED:
		"O código do dispositivo não foi reivindicado por uma sessão de verificação; chame `GET /device` com o `user_code` enquanto estiver conectado antes de aprovar ou negar",
	POLLING_TOO_FREQUENTLY: "Sondagem muito frequente",
	USER_NOT_FOUND: "Usuário não encontrado",
	FAILED_TO_CREATE_SESSION: "Falha ao criar sessão",
	INVALID_DEVICE_CODE_STATUS: "Status do código do dispositivo inválido",
	AUTHENTICATION_REQUIRED: "Autenticação necessária",
};
