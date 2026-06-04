import { describe, expect, it } from "vitest";
import {
	includesGrantedScope,
	normalizeScopes,
	resolveRequestedScopes,
	unionGrantedScopes,
} from "./scopes";

describe("normalizeScopes", () => {
	it("unions, dedupes, and sorts ascending", () => {
		expect(normalizeScopes(["profile", "email"], ["email", "openid"])).toEqual([
			"email",
			"openid",
			"profile",
		]);
	});

	it("trims tokens and drops empties", () => {
		expect(normalizeScopes(["  profile  ", "", "   "], [" email "])).toEqual([
			"email",
			"profile",
		]);
	});

	it("returns [] when both inputs are empty or nullish", () => {
		expect(normalizeScopes([], [])).toEqual([]);
		expect(normalizeScopes(null, undefined)).toEqual([]);
		expect(normalizeScopes(undefined, [])).toEqual([]);
	});

	it("normalizes a single non-empty side", () => {
		expect(normalizeScopes(null, ["b", "a", "a"])).toEqual(["a", "b"]);
		expect(normalizeScopes(["b", "a"], undefined)).toEqual(["a", "b"]);
	});
});

describe("unionGrantedScopes", () => {
	it("uses the echoed set when present (echoed wins)", () => {
		expect(
			unionGrantedScopes(["email"], ["email", "openid"], ["profile"]),
		).toEqual(["email", "openid"]);
	});

	it("falls back to requested when echoed is omitted (RFC 6749 §5.1)", () => {
		expect(unionGrantedScopes([], undefined, ["email", "profile"])).toEqual([
			"email",
			"profile",
		]);
	});

	it("falls back to requested when echoed is an empty array", () => {
		expect(unionGrantedScopes([], [], ["email", "profile"])).toEqual([
			"email",
			"profile",
		]);
	});

	it("never narrows: a subset echo keeps the stored grant via union", () => {
		expect(
			unionGrantedScopes(["email", "profile", "openid"], ["email"], ["email"]),
		).toEqual(["email", "openid", "profile"]);
	});

	it("returns a normalized union of stored and granted", () => {
		expect(
			unionGrantedScopes(["profile"], ["openid", "email"], undefined),
		).toEqual(["email", "openid", "profile"]);
	});

	it("returns [] when nothing was stored, echoed, or requested", () => {
		expect(unionGrantedScopes(null, undefined, undefined)).toEqual([]);
		expect(unionGrantedScopes([], [], [])).toEqual([]);
	});
});

describe("includesGrantedScope", () => {
	it("matches a scope present in the normalized array", () => {
		expect(includesGrantedScope(["email", "profile"], "email")).toBe(true);
		expect(includesGrantedScope(["email", "profile"], "openid")).toBe(false);
	});

	it("matches case-sensitively (RFC 6749 §3.3)", () => {
		expect(includesGrantedScope(["Email"], "email")).toBe(false);
	});

	it("returns false for null, undefined, or empty input", () => {
		expect(includesGrantedScope(null, "email")).toBe(false);
		expect(includesGrantedScope(undefined, "email")).toBe(false);
		expect(includesGrantedScope([], "email")).toBe(false);
	});
});

describe("resolveRequestedScopes", () => {
	it("composes defaults, configured, then per-request scopes in order", () => {
		expect(
			resolveRequestedScopes(
				{ scope: ["custom"] },
				["openid", "email"],
				["calendar"],
			),
		).toEqual(["openid", "email", "custom", "calendar"]);
	});

	it("drops the defaults when disableDefaultScope is set", () => {
		expect(
			resolveRequestedScopes(
				{ scope: ["custom"], disableDefaultScope: true },
				["openid", "email"],
				undefined,
			),
		).toEqual(["custom"]);
	});

	it("returns the defaults when no options or per-request scopes are given", () => {
		expect(resolveRequestedScopes(undefined, ["openid"], undefined)).toEqual([
			"openid",
		]);
	});
});
