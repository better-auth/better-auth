export const LOGIN_ALIAS_ERROR_CODES = {
	ALIAS_ALREADY_EXISTS: "Alias already exists",
	ALIAS_NOT_FOUND: "Alias not found",
	ALIAS_TYPE_NOT_ALLOWED: "Alias type not allowed",
	MAX_ALIASES_REACHED: "Maximum number of aliases reached",
	CANNOT_REMOVE_PRIMARY: "Cannot remove primary alias",
	CANNOT_REMOVE_LAST_ALIAS: "Cannot remove the last login method",
	ALIAS_NOT_VERIFIED: "Alias not verified",
	INVALID_ALIAS_VALUE: "Invalid alias value",
	ALIAS_BELONGS_TO_ANOTHER_USER: "Alias belongs to another user",
	VERIFICATION_REQUIRED: "Verification required for this alias type",
} as const;

export type LoginAliasErrorCode =
	(typeof LOGIN_ALIAS_ERROR_CODES)[keyof typeof LOGIN_ALIAS_ERROR_CODES];

