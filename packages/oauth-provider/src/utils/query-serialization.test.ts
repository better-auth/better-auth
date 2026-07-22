import { describe, expect, it } from "vitest";

import {
	getSignedQueryIssuedAt,
	isSessionFreshForSignedQuery,
	removeMaxAgeFromQuery,
	removePromptFromQuery,
	searchParamsToQuery,
	signedQueryIssuedAtParam,
} from "./index";

describe("searchParamsToQuery", () => {
	it("preserves single-valued params as strings", () => {
		const params = new URLSearchParams("client_id=abc&scope=openid");
		const result = searchParamsToQuery(params);

		expect(result).toEqual({
			client_id: "abc",
			scope: "openid",
		});
	});

	it("preserves multi-valued params as arrays", () => {
		const params = new URLSearchParams(
			"resource=https://api.example.com&resource=https://other.example.com",
		);
		const result = searchParamsToQuery(params);

		expect(result).toEqual({
			resource: ["https://api.example.com", "https://other.example.com"],
		});
	});

	it("handles a mix of single and multi-valued params", () => {
		const params = new URLSearchParams();
		params.append("client_id", "abc");
		params.append("resource", "https://api.example.com");
		params.append("resource", "https://other.example.com");
		params.append("scope", "openid profile");

		const result = searchParamsToQuery(params);

		expect(result).toEqual({
			client_id: "abc",
			resource: ["https://api.example.com", "https://other.example.com"],
			scope: "openid profile",
		});
	});

	it("handles empty params", () => {
		const params = new URLSearchParams();
		const result = searchParamsToQuery(params);

		expect(result).toEqual({});
	});
});

describe("removePromptFromQuery", () => {
	it("removes a prompt value and preserves other params", () => {
		const params = new URLSearchParams(
			"client_id=abc&prompt=login consent&scope=openid",
		);
		const result = searchParamsToQuery(removePromptFromQuery(params, "login"));

		expect(result.prompt).toBe("consent");
		expect(result.client_id).toBe("abc");
		expect(result.scope).toBe("openid");
	});

	it("deletes the prompt key when the last value is removed", () => {
		const params = new URLSearchParams(
			"client_id=abc&prompt=consent&scope=openid",
		);
		const result = searchParamsToQuery(
			removePromptFromQuery(params, "consent"),
		);

		expect(result.prompt).toBeUndefined();
		expect(result.client_id).toBe("abc");
	});

	it("preserves multi-valued params through prompt deletion", () => {
		const params = new URLSearchParams();
		params.append("client_id", "abc");
		params.append("prompt", "login consent");
		params.append("resource", "https://api.example.com");
		params.append("resource", "https://other.example.com");

		const result = searchParamsToQuery(removePromptFromQuery(params, "login"));

		expect(result.prompt).toBe("consent");
		expect(result.resource).toEqual([
			"https://api.example.com",
			"https://other.example.com",
		]);
	});

	it("does nothing when the prompt value is not present", () => {
		const params = new URLSearchParams("client_id=abc&prompt=consent");
		const result = searchParamsToQuery(removePromptFromQuery(params, "login"));

		expect(result.prompt).toBe("consent");
	});

	it("does not mutate the original query", () => {
		const params = new URLSearchParams(
			"client_id=abc&prompt=login consent&scope=openid",
		);
		removePromptFromQuery(params, "login");

		expect(params.get("prompt")).toBe("login consent");
	});
});

describe("removeMaxAgeFromQuery", () => {
	it("removes max_age and preserves other params", () => {
		const params = new URLSearchParams(
			"client_id=abc&max_age=0&prompt=login&scope=openid",
		);
		const result = searchParamsToQuery(removeMaxAgeFromQuery(params));

		expect(result.max_age).toBeUndefined();
		expect(result.client_id).toBe("abc");
		expect(result.prompt).toBe("login");
		expect(result.scope).toBe("openid");
	});

	it("does not mutate the original query", () => {
		const params = new URLSearchParams("client_id=abc&max_age=0");
		removeMaxAgeFromQuery(params);

		expect(params.get("max_age")).toBe("0");
	});
});

describe("getSignedQueryIssuedAt", () => {
	it("reads the signed query issue time when present", () => {
		const issuedAt = 1777026004123;
		const params = new URLSearchParams({
			client_id: "abc",
			[signedQueryIssuedAtParam]: String(issuedAt),
		});

		expect(getSignedQueryIssuedAt(params.toString())).toEqual(
			new Date(issuedAt),
		);
	});

	it("returns null when ba_iat is absent", () => {
		const params = new URLSearchParams({
			client_id: "abc",
			exp: "1777026604",
		});

		expect(getSignedQueryIssuedAt(params.toString())).toBeNull();
	});

	it("returns null when ba_iat is not a positive finite number", () => {
		const params = new URLSearchParams({
			client_id: "abc",
			[signedQueryIssuedAtParam]: "not-a-number",
		});

		expect(getSignedQueryIssuedAt(params.toString())).toBeNull();
	});
});

describe("isSessionFreshForSignedQuery", () => {
	it("accepts a session created at or after the signed query issue time", () => {
		const issuedAt = new Date("2026-06-08T12:00:00.000Z");

		expect(isSessionFreshForSignedQuery(issuedAt, issuedAt)).toBe(true);
		expect(
			isSessionFreshForSignedQuery(
				new Date("2026-06-08T12:00:00.001Z"),
				issuedAt,
			),
		).toBe(true);
	});

	it("rejects a session that predates the signed query issue time", () => {
		expect(
			isSessionFreshForSignedQuery(
				new Date("2026-06-08T11:59:59.999Z"),
				new Date("2026-06-08T12:00:00.000Z"),
			),
		).toBe(false);
	});

	it("rejects missing or invalid timestamps", () => {
		const issuedAt = new Date("2026-06-08T12:00:00.000Z");

		expect(isSessionFreshForSignedQuery(undefined, issuedAt)).toBe(false);
		expect(isSessionFreshForSignedQuery("not-a-date", issuedAt)).toBe(false);
		expect(isSessionFreshForSignedQuery(issuedAt, undefined)).toBe(false);
	});
});
