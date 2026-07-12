import type { DEVICE_AUTHORIZATION_ERROR_CODES } from "better-auth/plugins/device-authorization";
import type { LocalizedTranslations } from "../../../types";

export const plDeviceAuthorization: LocalizedTranslations<
	typeof DEVICE_AUTHORIZATION_ERROR_CODES
> = {
	INVALID_DEVICE_CODE: "Nieprawidłowy kod urządzenia",
	EXPIRED_DEVICE_CODE: "Kod urządzenia wygasł",
	EXPIRED_USER_CODE: "Kod użytkownika wygasł",
	AUTHORIZATION_PENDING: "Oczekiwanie na autoryzację",
	ACCESS_DENIED: "Odmowa dostępu",
	INVALID_USER_CODE: "Nieprawidłowy kod użytkownika",
	DEVICE_CODE_ALREADY_PROCESSED: "Kod urządzenia został już przetworzony",
	DEVICE_CODE_NOT_CLAIMED:
		"Kod urządzenia nie został zgłoszony przez sesję weryfikacyjną; wywołaj `GET /device` z parametrem `user_code` podczas logowania przed zatwierdzeniem lub odrzuceniem",
	POLLING_TOO_FREQUENTLY: "Zbyt częste odpytywanie",
	USER_NOT_FOUND: "Użytkownik nie został znaleziony",
	FAILED_TO_CREATE_SESSION: "Nie udało się utworzyć sesji",
	INVALID_DEVICE_CODE_STATUS: "Nieprawidłowy status kodu urządzenia",
	AUTHENTICATION_REQUIRED: "Wymagane uwierzytelnienie",
};
