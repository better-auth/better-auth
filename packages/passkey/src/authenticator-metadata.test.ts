import { describe, expect, it } from "vitest";
import {
	commonAuthenticatorNames,
	getAuthenticatorName,
} from "./authenticator-metadata";

describe("getAuthenticatorName", () => {
	it("resolves known AAGUIDs", () => {
		expect(getAuthenticatorName("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4")).toBe(
			"Google Password Manager",
		);
		expect(getAuthenticatorName("fbfc3007-154e-4ecc-8c0b-6e020557d7bd")).toBe(
			"Apple Passwords",
		);
		expect(getAuthenticatorName("bada5566-a7aa-401f-bd96-45619a55120d")).toBe(
			"1Password",
		);
		expect(getAuthenticatorName("d548826e-79b4-db40-a3d8-11116f7e8349")).toBe(
			"Bitwarden",
		);
		expect(getAuthenticatorName("53414d53-554e-4700-0000-000000000000")).toBe(
			"Samsung Pass",
		);
	});

	it("resolves every AAGUID of a multi-AAGUID provider", () => {
		for (const aaguid of [
			"08987058-cadc-4b81-b6e1-30de50dcbe96",
			"9ddd1817-af5a-4672-a2b9-3e3dd95000a9",
			"6028b017-b1d4-4c02-b4b3-afcdafc96bb2",
		]) {
			expect(getAuthenticatorName(aaguid)).toBe("Windows Hello");
		}
	});

	it("normalizes casing and whitespace", () => {
		expect(
			getAuthenticatorName("  DD4EC289-E01D-41C9-BB89-70FA845D4BF2  "),
		).toBe("iCloud Keychain (Managed)");
	});

	it("returns undefined for the all-zero AAGUID, even if added to the map", () => {
		const zero = "00000000-0000-0000-0000-000000000000";
		expect(getAuthenticatorName(zero)).toBeUndefined();
		commonAuthenticatorNames[zero] = "Spoofed Provider";
		try {
			expect(getAuthenticatorName(zero)).toBeUndefined();
		} finally {
			delete commonAuthenticatorNames[zero];
		}
	});

	it("returns undefined for unknown, empty, or missing input", () => {
		expect(
			getAuthenticatorName("11111111-1111-1111-1111-111111111111"),
		).toBeUndefined();
		expect(getAuthenticatorName("")).toBeUndefined();
		expect(getAuthenticatorName("   ")).toBeUndefined();
		expect(getAuthenticatorName(undefined)).toBeUndefined();
		expect(getAuthenticatorName(null)).toBeUndefined();
	});

	it("does not leak inherited object properties through index lookup", () => {
		for (const key of ["__proto__", "constructor", "toString", "valueOf"]) {
			expect(getAuthenticatorName(key)).toBeUndefined();
		}
	});

	it("exposes the raw map so consumers can extend it", () => {
		const extended: Record<string, string> = {
			...commonAuthenticatorNames,
			"11111111-1111-1111-1111-111111111111": "My Provider",
		};
		expect(extended["11111111-1111-1111-1111-111111111111"]).toBe(
			"My Provider",
		);
		expect(extended["ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4"]).toBe(
			"Google Password Manager",
		);
	});
});
