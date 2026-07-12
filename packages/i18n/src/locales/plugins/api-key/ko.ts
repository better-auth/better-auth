import type { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import type { LocalizedTranslations } from "../../../types";

export const koApiKey: LocalizedTranslations<typeof API_KEY_ERROR_CODES> = {
	INVALID_METADATA_TYPE: "메타데이터는 객체이거나 정의되지 않아야 합니다",
	REFILL_AMOUNT_AND_INTERVAL_REQUIRED:
		"refillInterval이 제공될 때 refillAmount가 필요합니다",
	REFILL_INTERVAL_AND_AMOUNT_REQUIRED:
		"refillAmount가 제공될 때 refillInterval이 필요합니다",
	USER_BANNED: "사용자가 차단되었습니다",
	UNAUTHORIZED_SESSION: "인증되지 않았거나 올바르지 않은 세션",
	KEY_NOT_FOUND: "API 키를 찾을 수 없습니다",
	KEY_DISABLED: "API 키가 비활성화되었습니다",
	KEY_EXPIRED: "API 키가 만료되었습니다",
	USAGE_EXCEEDED: "API 키의 사용 제한에 도달했습니다",
	KEY_NOT_RECOVERABLE: "API 키를 복구할 수 없습니다",
	EXPIRES_IN_IS_TOO_SMALL: "expiresIn 값이 정의된 최소값보다 작습니다.",
	EXPIRES_IN_IS_TOO_LARGE: "expiresIn 값이 정의된 최대값보다 큽니다.",
	INVALID_REMAINING: "남은 횟수가 너무 많거나 적습니다.",
	INVALID_PREFIX_LENGTH: "접두사 길이가 너무 길거나 짧습니다.",
	INVALID_NAME_LENGTH: "이름 길이가 너무 길거나 짧습니다.",
	METADATA_DISABLED: "메타데이터가 비활성화되었습니다.",
	RATE_LIMIT_EXCEEDED: "요청 제한을 초과했습니다.",
	NO_VALUES_TO_UPDATE: "업데이트할 값이 없습니다.",
	KEY_DISABLED_EXPIRATION: "사용자 지정 키 만료 설정은 비활성화되었습니다.",
	INVALID_API_KEY: "올바르지 않은 API 키입니다.",
	INVALID_USER_ID_FROM_API_KEY: "API 키의 사용자 ID가 올바르지 않습니다.",
	INVALID_REFERENCE_ID_FROM_API_KEY: "API 키의 참조 ID가 올바르지 않습니다.",
	INVALID_API_KEY_GETTER_RETURN_TYPE:
		"API 키 게터가 잘못된 키 형식을 반환했습니다. 문자열 형식이어야 합니다.",
	SERVER_ONLY_PROPERTY:
		"설정하려는 속성은 서버 인증 인스턴스에서만 설정할 수 있습니다.",
	FAILED_TO_UPDATE_API_KEY: "API 키 업데이트에 실패했습니다",
	NAME_REQUIRED: "API 키 이름이 필요합니다.",
	ORGANIZATION_ID_REQUIRED: "조직 소유 API 키에는 조직 ID가 필요합니다.",
	USER_NOT_MEMBER_OF_ORGANIZATION: "이 API 키를 소유한 조직의 멤버가 아닙니다.",
	INSUFFICIENT_API_KEY_PERMISSIONS:
		"조직 API 키에 대한 동작을 수행할 권한이 없습니다.",
	NO_DEFAULT_API_KEY_CONFIGURATION_FOUND:
		"기본 API 키 설정을 찾을 수 없습니다.",
	ORGANIZATION_PLUGIN_REQUIRED:
		"조직 소유 API 키에는 조직 플러그인이 필요합니다. 조직 플러그인을 설치하고 설정해 주세요.",
};
