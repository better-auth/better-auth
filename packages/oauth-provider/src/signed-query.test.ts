import { describe, expect, it } from "vitest";
import {
	buildSignedOAuthQuery,
	canonicalizeOAuthQueryParams,
	setSignedOAuthQueryParameterNames,
} from "./signed-query";

const signedQueryParameterNameParam = "ba_param";

describe("signed OAuth query", () => {
	it("builds oauth_query from declared signed params", () => {
		const signedParams = new URLSearchParams();
		signedParams.set("client_id", "client-a");
		signedParams.set("custom_authorization_context", "tenant-a");
		signedParams.append("resource", "https://api.example.com");
		signedParams.set("exp", "123");
		setSignedOAuthQueryParameterNames(signedParams);
		signedParams.set("sig", "test-sig");

		const reorderedParams = new URLSearchParams();
		for (const [key, value] of [...signedParams.entries()].reverse()) {
			reorderedParams.append(key, value);
		}
		reorderedParams.append("utm_email", "user@example.com");

		const oauthQuery = buildSignedOAuthQuery(`?${reorderedParams.toString()}`);
		if (!oauthQuery) {
			throw new Error("Expected signed OAuth query");
		}
		const oauthParams = new URLSearchParams(oauthQuery);

		expect(oauthParams.get("custom_authorization_context")).toBe("tenant-a");
		expect(oauthParams.get("resource")).toBe("https://api.example.com");
		expect(oauthParams.get("utm_email")).toBeNull();
		expect(oauthParams.getAll(signedQueryParameterNameParam)).toContain(
			"custom_authorization_context",
		);
	});

	it("ignores legacy signed queries without declared signed params", () => {
		expect(buildSignedOAuthQuery("?client_id=client-a&sig=test-sig")).toBe(
			undefined,
		);
	});

	it("canonicalizes repeated params by key and value", () => {
		const params = new URLSearchParams();
		params.append("resource", "https://b.example.com");
		params.append("client_id", "client-a");
		params.append("resource", "https://a.example.com");

		expect(canonicalizeOAuthQueryParams(params).toString()).toBe(
			"client_id=client-a&resource=https%3A%2F%2Fa.example.com&resource=https%3A%2F%2Fb.example.com",
		);
	});
});
