import type { RequestContext } from "@better-fetch/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { setSignedOAuthQueryParameterNames } from "./signed-query";

const onRequest = oauthProviderClient().fetchPlugins[0]!.hooks!.onRequest!;

function requestContext(body: string, contentType: string) {
	return {
		url: "https://auth.example.com/api/auth/custom",
		method: "POST",
		headers: new Headers({ "content-type": contentType }),
		body,
		signal: new AbortController().signal,
	} as RequestContext;
}

describe("oauthProviderClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12072
	 */
	it("leaves the body untouched when the page query is not signed", async () => {
		vi.stubGlobal("window", { location: { search: "?tab=profile" } });

		const jsonBody = JSON.stringify({ at: "2026-10-27T10:00:00Z" });
		const jsonCtx = requestContext(jsonBody, "application/json");
		await onRequest(jsonCtx);
		expect(jsonCtx.body).toBe(jsonBody);

		const formCtx = requestContext(
			"a=1&b=2",
			"application/x-www-form-urlencoded",
		);
		await onRequest(formCtx);
		expect(formCtx.body).toBe("a=1&b=2");
	});

	it("adds oauth_query when the page query is signed", async () => {
		const params = new URLSearchParams({ client_id: "client-a" });
		setSignedOAuthQueryParameterNames(params);
		params.set("sig", "test-sig");
		vi.stubGlobal("window", { location: { search: `?${params}` } });

		const ctx = requestContext("{}", "application/json");
		await onRequest(ctx);
		const body = JSON.parse(ctx.body);
		expect(new URLSearchParams(body.oauth_query).get("sig")).toBe("test-sig");
	});

	it("keeps signed form bodies form encoded", async () => {
		const params = new URLSearchParams({ client_id: "client-a" });
		setSignedOAuthQueryParameterNames(params);
		params.set("sig", "test-sig");
		vi.stubGlobal("window", { location: { search: `?${params}` } });

		const ctx = requestContext("a=1", "application/x-www-form-urlencoded");
		await onRequest(ctx);
		const sent = new URLSearchParams(ctx.body);
		expect(sent.get("a")).toBe("1");
		expect(new URLSearchParams(sent.get("oauth_query")!).get("sig")).toBe(
			"test-sig",
		);
	});

	it("does not rewrite date strings on signed pages", async () => {
		const params = new URLSearchParams({ client_id: "client-a" });
		setSignedOAuthQueryParameterNames(params);
		params.set("sig", "test-sig");
		vi.stubGlobal("window", { location: { search: `?${params}` } });

		const ctx = requestContext(
			JSON.stringify({ at: "2026-10-27T10:00:00Z" }),
			"application/json",
		);
		await onRequest(ctx);
		expect(JSON.parse(ctx.body).at).toBe("2026-10-27T10:00:00Z");
	});
});
