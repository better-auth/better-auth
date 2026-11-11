import { describe, expect, it } from "vitest";
import {
	readHeaderString,
	serializeCookieAttributes,
	toRefreshInitiators,
} from "../src/protocol";

describe("serializeCookieAttributes", () => {
	it("describes the cookie as the serializer sets it", () => {
		expect(
			serializeCookieAttributes("better-auth.dbsc_x", {
				path: "/",
				httpOnly: true,
				sameSite: "none",
			}),
		).toBe("Path=/; HttpOnly; Secure; SameSite=None");
		expect(
			serializeCookieAttributes("__Secure-better-auth.dbsc_x", {
				path: "/",
				httpOnly: true,
				sameSite: "lax",
			}),
		).toBe("Path=/; HttpOnly; Secure; SameSite=Lax");
		expect(
			serializeCookieAttributes("__Host-better-auth.dbsc_x", {
				domain: "example.com",
				path: "/",
				httpOnly: true,
				sameSite: "lax",
				maxAge: 600,
			}),
		).toBe("Path=/; HttpOnly; Secure; SameSite=Lax");
	});
});

describe("toRefreshInitiators", () => {
	it("keeps trusted hosts on the auth host's site, with or without a scheme", () => {
		expect(
			toRefreshInitiators(
				[
					"https://app.example.com",
					"*.example.com",
					"https://api.example.com",
					"https://appleid.apple.com",
					"https://app-*.example.com",
					"myapp://",
				],
				"api.example.com",
			),
		).toEqual(["app.example.com", "*.example.com"]);
	});

	it("uses the public suffix list to decide what counts as the same site", () => {
		expect(
			toRefreshInitiators(
				[
					"https://app.example.co.uk",
					"https://evil.co.uk",
					"https://other-app.vercel.app",
				],
				"api.example.co.uk",
			),
		).toEqual(["app.example.co.uk"]);
		expect(
			toRefreshInitiators(
				["https://other-app.vercel.app"],
				"my-app.vercel.app",
			),
		).toEqual([]);
	});
});

describe("readHeaderString", () => {
	it("accepts quoted and raw values", () => {
		expect(readHeaderString('"a\\"b"')).toBe('a"b');
		expect(readHeaderString("raw")).toBe("raw");
		expect(readHeaderString(null)).toBeNull();
	});
});
