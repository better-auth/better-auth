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
			"USER_ALREADY_EXISTS",
			"USER_ALREADY_HAS_PASSWORD",
			"FAILED_TO_CREATE_VERIFICATION",
			"SESSION_EXPIRED",
			"ACCOUNT_NOT_FOUND",
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
