import { describe, expect, it } from "vitest";
import { getKnownAuthenticatorName } from "./authenticator-metadata";

describe("getKnownAuthenticatorName", () => {
	it("should resolve known AAGUID", () => {
		expect(
			getKnownAuthenticatorName("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4"),
		).toBe("Google Password Manager");
		expect(
			getKnownAuthenticatorName("fbfc3007-154e-4ecc-8c0b-6e020557d7bd"),
		).toBe("Apple Passwords");
		expect(
			getKnownAuthenticatorName("531126d6-e717-415c-9320-3d9aa6981239"),
		).toBe("Dashlane");
	});

	it("should normalize casing and whitespace", () => {
		expect(
			getKnownAuthenticatorName("  DD4EC289-E01D-41C9-BB89-70FA845D4BF2  "),
		).toBe("iCloud Keychain");
	});

	it("should return undefined for unknown AAGUID", () => {
		expect(
			getKnownAuthenticatorName("11111111-1111-1111-1111-111111111111"),
		).toBeUndefined();
	});
});
