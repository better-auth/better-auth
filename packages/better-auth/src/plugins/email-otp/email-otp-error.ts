// Moved from `index.ts` for better structure
export const ERROR_CODES = {
	OTP_EXPIRED: "otp expired",
	INVALID_OTP: "Invalid OTP",
	INVALID_EMAIL: "Invalid email",
	USER_NOT_FOUND: "User not found",
	TOO_MANY_ATTEMPTS: "Too many attempts",
} as const;
