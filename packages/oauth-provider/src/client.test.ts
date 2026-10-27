import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { setSignedOAuthQueryParameterNames } from "./signed-query";

const onRequest = oauthProviderClient().fetchPlugins[0].hooks.onRequest;

function request(
	body: string,
	contentType = "application/json",
	method = "POST",
) {
	return {
		body,
		headers: new Headers({ "content-type": contentType }),
		method,
	} as Parameters<typeof onRequest>[0];
}

function signedSearch() {
	const params = new URLSearchParams({ client_id: "client-a", exp: "123" });
	setSignedOAuthQueryParameterNames(params);
	params.set("sig", "test-sig");
	return `?${params.toString()}`;
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12072
 */
describe("OAuth provider signin request hook", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each(["POST", "PUT", "PATCH"])(
		"preserves unsigned JSON bodies for %s requests",
		async (method) => {
			vi.stubGlobal("window", { location: { search: "?token=abc" } });
			const body = '{ "date": "2026-01-01T00:00:00Z" }';
			const ctx = request(body, "application/json", method);
			await onRequest(ctx);
			expect(ctx.body).toBe(body);
		},
	);

	it("preserves unsigned form-urlencoded bodies", async () => {
		vi.stubGlobal("window", { location: { search: "?tab=profile" } });
		const body = "name=Alice+Smith&token=a%2Bb";
		const ctx = request(body, "application/x-www-form-urlencoded");
		await onRequest(ctx);
		expect(ctx.body).toBe(body);
	});

	it("preserves unsigned array bodies", async () => {
		vi.stubGlobal("window", { location: { search: "?tab=profile" } });
		const body = '["first","second"]';
		const ctx = request(body);
		await onRequest(ctx);
		expect(ctx.body).toBe(body);
	});

	it.each(["", undefined])(
		"preserves bodies without a query (%s)",
		async (search) => {
			vi.stubGlobal(
				"window",
				search === undefined ? undefined : { location: { search } },
			);
			const body = '{ "date": "2026-01-01T00:00:00Z" }';
			const ctx = request(body);
			await onRequest(ctx);
			expect(ctx.body).toBe(body);
		},
	);

	it("adds signed OAuth queries while preserving ISO date strings", async () => {
		const search = signedSearch();
		vi.stubGlobal("window", { location: { search } });
		const date = "2026-01-01T00:00:00Z";
		const ctx = request(JSON.stringify({ date }));
		await onRequest(ctx);
		expect(JSON.parse(ctx.body)).toEqual({
			date,
			oauth_query: search.slice(1),
		});
	});

	it("merges signed queries into form-urlencoded bodies", async () => {
		const search = signedSearch();
		vi.stubGlobal("window", { location: { search } });
		const ctx = request(
			"name=Alice+Smith",
			"application/x-www-form-urlencoded",
		);
		await onRequest(ctx);
		expect(JSON.parse(ctx.body)).toEqual({
			name: "Alice Smith",
			oauth_query: search.slice(1),
		});
	});

	it("preserves an existing oauth_query", async () => {
		vi.stubGlobal("window", { location: { search: signedSearch() } });
		const body = '{ "oauth_query": "existing" }';
		const ctx = request(body);
		await onRequest(ctx);
		expect(ctx.body).toBe(body);
	});

	it.each(["GET", "DELETE"])(
		"preserves bodies for %s requests",
		async (method) => {
			vi.stubGlobal("window", { location: { search: signedSearch() } });
			const body = '{ "date": "2026-01-01T00:00:00Z" }';
			const ctx = request(body, "application/json", method);
			await onRequest(ctx);
			expect(ctx.body).toBe(body);
		},
	);
});
