import { describe, expect, it } from "vitest";
import {
	createAuthorizationURL,
	RESERVED_AUTHORIZATION_PARAMS,
} from "./create-authorization-url";

const baseInput = {
	id: "test",
	options: { clientId: "client-123", clientSecret: "s", redirectURI: "" },
	authorizationEndpoint: "https://idp.example/authorize",
	state: "state-xyz",
	redirectURI: "https://app.example/callback",
	scopes: ["openid"],
};

describe("createAuthorizationURL", () => {
	it("appends additionalParams as query string entries", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			additionalParams: {
				identity_provider: "Google",
				hd: "example.com",
			},
		});
		expect(url.searchParams.get("identity_provider")).toBe("Google");
		expect(url.searchParams.get("hd")).toBe("example.com");
	});

	it("omits scope when the resolved scope list is empty", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			scopes: [],
		});

		expect(url.searchParams.has("scope")).toBe(false);
	});

	it("silently drops reserved OAuth params supplied via additionalParams", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			nonce: "server-nonce",
			additionalParams: {
				state: "attacker-controlled",
				client_id: "attacker",
				redirect_uri: "https://attacker.example/callback",
				response_type: "token",
				code_challenge: "malicious",
				code_challenge_method: "plain",
				nonce: "attacker-nonce",
				scope: "admin",
				identity_provider: "OktaSSO",
			},
		});
		expect(url.searchParams.get("state")).toBe("state-xyz");
		expect(url.searchParams.get("client_id")).toBe("client-123");
		expect(url.searchParams.get("redirect_uri")).toBe(
			"https://app.example/callback",
		);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("code_challenge")).toBeNull();
		expect(url.searchParams.get("nonce")).toBe("server-nonce");
		expect(url.searchParams.get("scope")).toBe("openid");
		expect(url.searchParams.get("identity_provider")).toBe("OktaSSO");
	});

	it("keeps the authorization endpoint's existing query text unchanged", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			authorizationEndpoint:
				"https://idp.example/authorize?tenant=acme%20inc&value=~",
		});

		expect(url.search).toMatch(/^\?tenant=acme%20inc&value=~&/);
		expect(url.searchParams.get("client_id")).toBe("client-123");
	});

	/**
	 * The query is opaque text, so empty `&`-separated segments are part of it.
	 * @see https://www.rfc-editor.org/rfc/rfc3986#section-3.4
	 */
	it("keeps empty segments in the authorization endpoint's query", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			authorizationEndpoint:
				"https://idp.example/authorize?tenant=acme&&value=~&&prompt=login",
			prompt: "consent",
		});

		expect(url.search).toMatch(/^\?tenant=acme&&value=~&&[^&]/);
		expect(url.searchParams.getAll("prompt")).toEqual(["consent"]);
	});

	it("keeps an empty segment left after replacing the only other pair", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			authorizationEndpoint: "https://idp.example/authorize?prompt=login&",
			prompt: "consent",
		});

		expect(url.search).toMatch(/^\?&[^&]/);
		expect(url.searchParams.getAll("prompt")).toEqual(["consent"]);
	});

	it("replaces an authorization endpoint parameter named `?`", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			authorizationEndpoint: "https://idp.example/authorize?tenant=acme&?",
			additionalParams: { "?": "new" },
		});

		expect(url.searchParams.getAll("?")).toEqual(["new"]);
		expect(url.search).toMatch(/^\?tenant=acme&[^&]/);
	});

	it("keeps a leading `?` in the authorization endpoint's first parameter name", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			authorizationEndpoint: "https://idp.example/authorize??state=stale",
		});

		expect(url.search).toMatch(/^\?\?state=stale&/);
		expect(url.searchParams.getAll("state")).toEqual(["state-xyz"]);
	});

	it("replaces an authorization endpoint query parameter it also sets", async () => {
		const url = await createAuthorizationURL({
			...baseInput,
			authorizationEndpoint:
				"https://idp.example/authorize?prompt=login&tenant=acme%20inc",
			prompt: "consent",
		});

		expect(url.searchParams.getAll("prompt")).toEqual(["consent"]);
		expect(url.search).toMatch(/^\?tenant=acme%20inc&/);
	});

	it("exposes the reserved param list for downstream consumers", () => {
		expect(RESERVED_AUTHORIZATION_PARAMS).toEqual([
			"state",
			"client_id",
			"redirect_uri",
			"response_type",
			"code_challenge",
			"code_challenge_method",
			"nonce",
			"scope",
		]);
	});
});
