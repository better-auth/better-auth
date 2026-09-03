import { describe, expect, it } from "vitest";
import {
	buildSolidClientIdDocument,
	DEFAULT_SOLID_SCOPES,
	SOLID_OIDC_CONTEXT_URL,
} from "./client-id-document";

const CLIENT_ID = "https://app.example/api/auth/solid/client-id/pod";
const REDIRECT_URI = "https://app.example/api/auth/callback/pod";

describe("buildSolidClientIdDocument", () => {
	it("declares the Solid-OIDC context", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
		});
		expect(document["@context"]).toEqual([SOLID_OIDC_CONTEXT_URL]);
	});

	/**
	 * Solid-OIDC identifies the client by the document's own URI, so the two
	 * values are the same by construction.
	 */
	it("uses the document's own URL as the client_id", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
		});
		expect(document.client_id).toBe(CLIENT_ID);
	});

	/**
	 * A client identified by a public document has no secret, so it can only
	 * authenticate as a public client. PKCE and DPoP carry the binding instead.
	 */
	it("declares public-client token endpoint authentication", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
		});
		expect(document.token_endpoint_auth_method).toBe("none");
		expect(document.response_types).toEqual(["code"]);
		expect(document.application_type).toBe("web");
	});

	it("requests the default Solid scopes", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
		});
		expect(document.scope).toBe(DEFAULT_SOLID_SCOPES.join(" "));
		expect(document.scope).toContain("webid");
	});

	it("advertises the refresh grant only when offline_access is requested", () => {
		const withRefresh = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
			scopes: ["openid", "webid", "offline_access"],
		});
		expect(withRefresh.grant_types).toEqual([
			"authorization_code",
			"refresh_token",
		]);

		const withoutRefresh = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
			scopes: ["openid", "webid"],
		});
		expect(withoutRefresh.grant_types).toEqual(["authorization_code"]);
	});

	it("carries the optional presentation metadata it was given", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
			clientName: "My App",
			clientURI: "https://app.example",
			logoURI: "https://app.example/logo.png",
			tosURI: "https://app.example/terms",
			policyURI: "https://app.example/privacy",
			contacts: ["security@app.example"],
			postLogoutRedirectURIs: ["https://app.example/signed-out"],
		});
		expect(document.client_name).toBe("My App");
		expect(document.client_uri).toBe("https://app.example");
		expect(document.logo_uri).toBe("https://app.example/logo.png");
		expect(document.tos_uri).toBe("https://app.example/terms");
		expect(document.policy_uri).toBe("https://app.example/privacy");
		expect(document.contacts).toEqual(["security@app.example"]);
		expect(document.post_logout_redirect_uris).toEqual([
			"https://app.example/signed-out",
		]);
	});

	it("omits optional members that were not supplied", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
		});
		for (const member of [
			"client_name",
			"client_uri",
			"logo_uri",
			"tos_uri",
			"policy_uri",
			"contacts",
			"post_logout_redirect_uris",
		]) {
			expect(document).not.toHaveProperty(member);
		}
	});

	it("lets additional metadata override a generated member", () => {
		const document = buildSolidClientIdDocument({
			clientId: CLIENT_ID,
			redirectURIs: [REDIRECT_URI],
			additionalMetadata: {
				require_auth_time: true,
				default_max_age: 3600,
			},
		});
		expect(document.require_auth_time).toBe(true);
		expect(document.default_max_age).toBe(3600);
	});

	it("requires at least one redirect URI", () => {
		expect(() =>
			buildSolidClientIdDocument({ clientId: CLIENT_ID, redirectURIs: [] }),
		).toThrow(/at least one redirect URI/);
	});

	it("rejects a relative or malformed URI", () => {
		expect(() =>
			buildSolidClientIdDocument({
				clientId: "/solid/client-id/pod",
				redirectURIs: [REDIRECT_URI],
			}),
		).toThrow(/must be an absolute URL/);
	});

	/**
	 * A Solid provider dereferences `client_id` over the network, so anything a
	 * provider could read in the clear is not an acceptable client identity.
	 */
	it("rejects plaintext http outside loopback", () => {
		expect(() =>
			buildSolidClientIdDocument({
				clientId: "http://app.example/client-id",
				redirectURIs: [REDIRECT_URI],
			}),
		).toThrow(/must use https/);
		expect(() =>
			buildSolidClientIdDocument({
				clientId: CLIENT_ID,
				redirectURIs: ["http://app.example/callback"],
			}),
		).toThrow(/must use https/);
	});

	it("allows plaintext http on loopback so local development works", () => {
		const document = buildSolidClientIdDocument({
			clientId: "http://localhost:3000/api/auth/solid/client-id/pod",
			redirectURIs: ["http://localhost:3000/api/auth/callback/pod"],
			postLogoutRedirectURIs: ["http://127.0.0.1:3000/"],
		});
		expect(document.client_id).toBe(
			"http://localhost:3000/api/auth/solid/client-id/pod",
		);
	});

	it("validates post-logout redirect URIs too", () => {
		expect(() =>
			buildSolidClientIdDocument({
				clientId: CLIENT_ID,
				redirectURIs: [REDIRECT_URI],
				postLogoutRedirectURIs: ["http://app.example/signed-out"],
			}),
		).toThrow(/must use https/);
	});
});
