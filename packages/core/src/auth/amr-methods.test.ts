import { describe, expect, expectTypeOf, it } from "vitest";
import type {
	AuthenticationMethodReference,
	BuiltinAMRMethod,
	RFC8176AMRValue,
} from "./amr-methods";
import {
	amrForProvider,
	BUILTIN_AMR_METHOD,
	RFC_8176_AMR_VALUES,
	toRfc8176Amr,
} from "./amr-methods";

describe("BUILTIN_AMR_METHOD constants", () => {
	it("exports the documented built-in method names as lowercase kebab-case", () => {
		expect(BUILTIN_AMR_METHOD).toStrictEqual({
			PASSWORD: "password",
			MAGIC_LINK: "magic-link",
			EMAIL_OTP: "email-otp",
			EMAIL_VERIFICATION: "email-verification",
			PHONE_OTP: "phone-otp",
			PASSKEY: "passkey",
			SIWE: "siwe",
			TOTP: "totp",
			OTP: "otp",
			BACKUP_CODE: "backup-code",
			API_KEY: "api-key",
		});
	});

	it("is `as const` so call sites type-narrow to the literal", () => {
		expectTypeOf(BUILTIN_AMR_METHOD.PASSWORD).toEqualTypeOf<"password">();
		expectTypeOf(BUILTIN_AMR_METHOD.MAGIC_LINK).toEqualTypeOf<"magic-link">();
		expectTypeOf(
			BUILTIN_AMR_METHOD.EMAIL_VERIFICATION,
		).toEqualTypeOf<"email-verification">();
	});

	it("BuiltinAMRMethod is the union of the constant values", () => {
		expectTypeOf<BuiltinAMRMethod>().toEqualTypeOf<
			| "password"
			| "magic-link"
			| "email-otp"
			| "email-verification"
			| "phone-otp"
			| "passkey"
			| "siwe"
			| "totp"
			| "otp"
			| "backup-code"
			| "api-key"
		>();
	});
});

describe("AuthenticationMethodReference", () => {
	it("accepts the documented shape: { method, factor, completedAt }", () => {
		const entry: AuthenticationMethodReference = {
			method: BUILTIN_AMR_METHOD.PASSWORD,
			factor: "knowledge",
			completedAt: new Date(),
		};
		expect(entry.method).toBe("password");
		expect(entry.factor).toBe("knowledge");
		expect(entry.completedAt).toBeInstanceOf(Date);
	});

	it("method is open to arbitrary strings (OAuth providers emit their id)", () => {
		const entry: AuthenticationMethodReference = {
			method: "google",
			factor: "possession",
			completedAt: new Date(),
		};
		expect(entry.method).toBe("google");
	});

	it("factor is a closed union aligned with NIST SP 800-63B categories", () => {
		expectTypeOf<AuthenticationMethodReference["factor"]>().toEqualTypeOf<
			"knowledge" | "possession" | "inherence"
		>();
	});
});

describe("amrForProvider", () => {
	it("emits possession factor with the providerId as method", () => {
		const entry = amrForProvider("google");
		expect(entry).toMatchObject({ method: "google", factor: "possession" });
		expect(entry.completedAt).toBeInstanceOf(Date);
	});

	it("stamps a fresh completedAt for each call", async () => {
		const first = amrForProvider("github");
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = amrForProvider("github");
		expect(second.completedAt.getTime()).toBeGreaterThanOrEqual(
			first.completedAt.getTime(),
		);
	});

	it("returns a fresh object every call (no shared mutable state)", () => {
		const first = amrForProvider("github");
		const second = amrForProvider("github");
		expect(first).not.toBe(second);
	});
});

describe("toRfc8176Amr (id_token.amr projection)", () => {
	it("translates Better Auth built-ins into RFC 8176 registry values", () => {
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.PASSWORD)).toBe("pwd");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.EMAIL_OTP)).toBe("otp");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.PHONE_OTP)).toBe("otp");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.OTP)).toBe("otp");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.MAGIC_LINK)).toBe("otp");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.EMAIL_VERIFICATION)).toBe("otp");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.TOTP)).toBe("mfa");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.PASSKEY)).toBe("hwk");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.BACKUP_CODE)).toBe("kba");
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.API_KEY)).toBe("pop");
	});

	it("passes SIWE through verbatim (not in registry, no semantic match)", () => {
		expect(toRfc8176Amr(BUILTIN_AMR_METHOD.SIWE)).toBe("siwe");
	});

	it("emits 'fed' for OAuth provider ids when caller marks the call as a provider", () => {
		expect(toRfc8176Amr("google", { provider: true })).toBe("fed");
		expect(toRfc8176Amr("github", { provider: true })).toBe("fed");
		expect(toRfc8176Amr("acme-saml", { provider: true })).toBe("fed");
	});

	it("passes unknown method strings through verbatim by default", () => {
		expect(toRfc8176Amr("custom-plugin-method")).toBe("custom-plugin-method");
	});

	it("RFC_8176_AMR_VALUES advertises the closed set used by discovery metadata", () => {
		expect(RFC_8176_AMR_VALUES).toStrictEqual([
			"pwd",
			"otp",
			"mfa",
			"hwk",
			"pop",
			"fed",
			"kba",
		]);
		expectTypeOf<RFC8176AMRValue>().toEqualTypeOf<
			"pwd" | "otp" | "mfa" | "hwk" | "pop" | "fed" | "kba"
		>();
	});
});
