import { describe, expect, it, vi } from "vitest";

// Same mock setup so the server-side plugin doesn't blow up on import.
const oauthMocks = vi.hoisted(() => ({
	authorize: vi.fn(),
	callback: vi.fn(),
	restore: vi.fn(),
	clientMetadata: {
		client_id: "test-client",
		client_name: "Better Auth",
		redirect_uris: ["http://127.0.0.1:3000/api/auth/atproto/callback"],
		grant_types: ["authorization_code", "refresh_token"],
		scope: "atproto transition:generic",
		response_types: ["code"],
		application_type: "web",
		token_endpoint_auth_method: "none",
		dpop_bound_access_tokens: true,
	},
	jwks: { keys: [] },
}));

vi.mock("@atproto/oauth-client-node", () => ({
	NodeOAuthClient: vi.fn().mockImplementation(function () {
		return {
			authorize: oauthMocks.authorize,
			callback: oauthMocks.callback,
			restore: oauthMocks.restore,
			clientMetadata: oauthMocks.clientMetadata,
			jwks: oauthMocks.jwks,
		};
	}),
}));

vi.mock("@atproto/jwk-jose", () => ({
	JoseKey: {
		fromImportable: vi.fn().mockResolvedValue({}),
	},
}));

vi.mock("@atproto/api", () => ({ Agent: vi.fn() }));

import { getTestInstance } from "better-auth/test";
import { atprotoClient } from "./client";
import { atproto } from "./index";

describe("atprotoClient", () => {
	it("exposes signIn.atproto, atproto.getSession, atproto.restore", async () => {
		const { client } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		expect(typeof client.signIn.atproto).toBe("function");
		expect(typeof client.atproto.getSession).toBe("function");
		expect(typeof client.atproto.restore).toBe("function");
	});

	it("declares correct pathMethods", () => {
		const plugin = atprotoClient();
		expect(plugin.pathMethods).toEqual({
			"/atproto/sign-in": "POST",
			"/atproto/session": "GET",
			"/atproto/restore": "POST",
		});
	});

	it("signIn.atproto POSTs to /atproto/sign-in with handle + callbackURL", async () => {
		const { client } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		oauthMocks.authorize.mockResolvedValueOnce(
			new URL("https://pds.example.com/authorize?x=1"),
		);
		const res = await client.signIn.atproto({
			handle: "alice.bsky.social",
			callbackURL: "/dashboard",
		});
		expect(res.data?.url).toBe("https://pds.example.com/authorize?x=1");
	});
});
