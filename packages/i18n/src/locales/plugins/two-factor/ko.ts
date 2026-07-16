import type { TWO_FACTOR_ERROR_CODES } from "better-auth/plugins/two-factor";
import type { LocalizedTranslations } from "../../../types";

export const koTwoFactor: LocalizedTranslations<typeof TWO_FACTOR_ERROR_CODES> =
	{
		OTP_NOT_ENABLED: "OTP가 활성화되지 않았습니다",
		OTP_NOT_CONFIGURED: "OTP가 구성되지 않았습니다",
		OTP_HAS_EXPIRED: "OTP가 만료되었습니다",
		TOTP_NOT_ENABLED: "TOTP가 활성화되지 않았습니다",
		TOTP_NOT_CONFIGURED: "TOTP가 구성되지 않았습니다",
		TWO_FACTOR_NOT_ENABLED: "이중 인증이 활성화되지 않았습니다",
		BACKUP_CODES_NOT_ENABLED: "백업 코드가 활성화되지 않았습니다",
		INVALID_BACKUP_CODE: "백업 코드가 유효하지 않거나 이미 사용되었습니다.",
		INVALID_CODE: "입력한 코드가 유효하지 않습니다. 확인 후 다시 시도하세요.",
		TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
			"시도 횟수가 너무 많습니다. 새 코드를 요청하세요.",
		ACCOUNT_TEMPORARILY_LOCKED:
			"인증 실패가 너무 많습니다. 계정이 일시적으로 잠겼습니다. 나중에 다시 시도하세요.",
		INVALID_TWO_FACTOR_COOKIE: "이중 인증 쿠키가 유효하지 않습니다",
	};
