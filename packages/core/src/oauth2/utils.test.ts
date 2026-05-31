import { describe, expect, it } from "vitest";
import { accumulateGrantedScopes, hasGrantedScope, mergeScopes } from "./utils";

describe("mergeScopes", () => {
	it("unions, dedupes, and sorts ascending", () => {
		expect(mergeScopes(["profile", "email"], ["email", "openid"])).toEqual([
			"email",
			"openid",
			"profile",
		]);
	});

	it("trims tokens and drops empties", () => {
		expect(mergeScopes(["  profile  ", "", "   "], [" email "])).toEqual([
			"email",
			"profile",
		]);
	});

	it("returns [] when both inputs are empty or nullish", () => {
		expect(mergeScopes([], [])).toEqual([]);
		expect(mergeScopes(null, undefined)).toEqual([]);
		expect(mergeScopes(undefined, [])).toEqual([]);
	});

	it("normalizes a single non-empty side", () => {
		expect(mergeScopes(null, ["b", "a", "a"])).toEqual(["a", "b"]);
		expect(mergeScopes(["b", "a"], undefined)).toEqual(["a", "b"]);
	});
});

describe("accumulateGrantedScopes", () => {
	it("uses the echoed set when present (echoed wins)", () => {
		expect(
			accumulateGrantedScopes(["email"], ["email", "openid"], ["profile"]),
		).toEqual(["email", "openid"]);
	});

	it("falls back to requested when echoed is omitted (RFC 6749 §5.1)", () => {
		expect(
			accumulateGrantedScopes([], undefined, ["email", "profile"]),
		).toEqual(["email", "profile"]);
	});

	it("falls back to requested when echoed is an empty array", () => {
		expect(accumulateGrantedScopes([], [], ["email", "profile"])).toEqual([
			"email",
			"profile",
		]);
	});

	it("never narrows: a subset echo keeps the stored grant via union", () => {
		expect(
			accumulateGrantedScopes(
				["email", "profile", "openid"],
				["email"],
				["email"],
			),
		).toEqual(["email", "openid", "profile"]);
	});

	it("returns a normalized union of stored and granted", () => {
		expect(
			accumulateGrantedScopes(["profile"], ["openid", "email"], undefined),
		).toEqual(["email", "openid", "profile"]);
	});

	it("returns [] when nothing was stored, echoed, or requested", () => {
		expect(accumulateGrantedScopes(null, undefined, undefined)).toEqual([]);
		expect(accumulateGrantedScopes([], [], [])).toEqual([]);
	});
});

describe("hasGrantedScope", () => {
	it("matches a scope present in an array", () => {
		expect(hasGrantedScope(["email", "profile"], "email")).toBe(true);
		expect(hasGrantedScope(["email", "profile"], "openid")).toBe(false);
	});

	it("parses a legacy space-delimited string", () => {
		expect(hasGrantedScope("email profile openid", "profile")).toBe(true);
		expect(hasGrantedScope("email profile", "openid")).toBe(false);
	});

	it("parses a legacy comma-delimited string", () => {
		expect(hasGrantedScope("email,profile,openid", "openid")).toBe(true);
		expect(hasGrantedScope("email, profile", "email")).toBe(true);
	});

	it("matches case-sensitively (RFC 6749 §3.3)", () => {
		expect(hasGrantedScope(["Email"], "email")).toBe(false);
	});

	it("returns false for null, undefined, or empty input", () => {
		expect(hasGrantedScope(null, "email")).toBe(false);
		expect(hasGrantedScope(undefined, "email")).toBe(false);
		expect(hasGrantedScope([], "email")).toBe(false);
		expect(hasGrantedScope("", "email")).toBe(false);
	});
});
