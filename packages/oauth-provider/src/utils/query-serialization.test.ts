import { describe, expect, it } from "vitest";

import {
	getSignedQueryIssuedAt,
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
