import { describe, expect, expectTypeOf, it } from "vitest";
import type { APIErrorCode } from "./codes";
import { BASE_ERROR_CODES } from "./codes";

/**
 * @see https://github.com/better-auth/better-auth/issues/11908
 */
describe("BASE_ERROR_CODES", () => {
	it("exposes every entry as { code, message } with code === key", () => {
		for (const [key, entry] of Object.entries(BASE_ERROR_CODES)) {
			expect(entry.code).toBe(key);
			expect(typeof entry.message).toBe("string");
			expect(entry.message.length).toBeGreaterThan(0);
		}
	});

	it("uses UPPER_SNAKE_CASE keys", () => {
		for (const key of Object.keys(BASE_ERROR_CODES)) {
			expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
		}
	});

	it("registers the core endpoint codes previously thrown as inline strings", () => {
		const expectedCodes = [
			"USER_ID_OR_SESSION_REQUIRED",
			"FAILED_TO_GET_ACCESS_TOKEN",
			"PROVIDER_NOT_SUPPORTED",
			"TOKEN_REFRESH_NOT_SUPPORTED",
			"REFRESH_TOKEN_NOT_FOUND",
			"FAILED_TO_REFRESH_ACCESS_TOKEN",
			"PROVIDER_NOT_CONFIGURED",
			"ACCESS_TOKEN_NOT_FOUND",
			"LINKING_NOT_ALLOWED",
			"LINKING_DIFFERENT_EMAILS_NOT_ALLOWED",
			"LINKING_FAILED",
			"EMAIL_PASSWORD_DISABLED",
			"EMAIL_PASSWORD_SIGN_UP_DISABLED",
			"RESET_PASSWORD_DISABLED",
			"UNAUTHORIZED",
			"NO_FIELDS_TO_UPDATE",
			"EMAIL_IS_THE_SAME",
		] as const;
		for (const code of expectedCodes) {
			expect(BASE_ERROR_CODES).toHaveProperty(code);
			expect(BASE_ERROR_CODES[code].code).toBe(code);
		}
	});

	it("preserves all pre-existing keys for backward compatibility", () => {
		const preservedCodes = [
			"USER_NOT_FOUND",
			"FAILED_TO_CREATE_USER",
			"FAILED_TO_CREATE_SESSION",
			"FAILED_TO_UPDATE_USER",
			"FAILED_TO_GET_SESSION",
			"INVALID_PASSWORD",
			"INVALID_EMAIL",
			"INVALID_EMAIL_OR_PASSWORD",
			"INVALID_USER",
			"SOCIAL_ACCOUNT_ALREADY_LINKED",
			"PROVIDER_NOT_FOUND",
			"INVALID_TOKEN",
			"TOKEN_EXPIRED",
			"ID_TOKEN_NOT_SUPPORTED",
			"FAILED_TO_GET_USER_INFO",
			"USER_EMAIL_NOT_FOUND",
			"EMAIL_NOT_VERIFIED",
			"PASSWORD_TOO_SHORT",
			"PASSWORD_TOO_LONG",
			"USER_ALREADY_EXISTS",
			"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
			"EMAIL_CAN_NOT_BE_UPDATED",
			"CHANGE_EMAIL_DISABLED",
			"CREDENTIAL_ACCOUNT_NOT_FOUND",
			"SESSION_EXPIRED",
			"FAILED_TO_UNLINK_LAST_ACCOUNT",
			"ACCOUNT_NOT_FOUND",
			"USER_ALREADY_HAS_PASSWORD",
			"CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
			"VERIFICATION_EMAIL_NOT_ENABLED",
			"EMAIL_ALREADY_VERIFIED",
			"EMAIL_MISMATCH",
			"SESSION_NOT_FRESH",
			"LINKED_ACCOUNT_ALREADY_EXISTS",
			"INVALID_ORIGIN",
			"INVALID_CALLBACK_URL",
			"INVALID_REDIRECT_URL",
			"INVALID_ERROR_CALLBACK_URL",
			"INVALID_NEW_USER_CALLBACK_URL",
			"MISSING_OR_NULL_ORIGIN",
			"CALLBACK_URL_REQUIRED",
			"FAILED_TO_CREATE_VERIFICATION",
			"FIELD_NOT_ALLOWED",
			"ASYNC_VALIDATION_NOT_SUPPORTED",
			"VALIDATION_ERROR",
			"MISSING_FIELD",
			"METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED",
			"BODY_MUST_BE_AN_OBJECT",
			"PASSWORD_ALREADY_SET",
		] as const;
		for (const code of preservedCodes) {
			expect(BASE_ERROR_CODES).toHaveProperty(code);
		}
	});

	it("exposes the registered codes through the APIErrorCode type", () => {
		expectTypeOf<APIErrorCode>().toEqualTypeOf<keyof typeof BASE_ERROR_CODES>();
		expectTypeOf<"FAILED_TO_GET_ACCESS_TOKEN">().toMatchTypeOf<APIErrorCode>();
		expectTypeOf<"UNAUTHORIZED">().toMatchTypeOf<APIErrorCode>();
		expectTypeOf<"NO_FIELDS_TO_UPDATE">().toMatchTypeOf<APIErrorCode>();
	});
});
