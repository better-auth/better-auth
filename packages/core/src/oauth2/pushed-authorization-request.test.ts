import { afterEach, describe, expect, it, vi } from "vitest";
import { pushAuthorizationRequest } from "./pushed-authorization-request";

const authorizationURL = new URL(
	"https://as.example.com/authorize?response_type=code&client_id=client&state=abc",
);

function respondWith(response: Response) {
	const fetchMock = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) => response,
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("pushAuthorizationRequest", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps the authorization endpoint's existing query text unchanged", async () => {
		const fetchMock = respondWith(
			Response.json(
				{ request_uri: "urn:example:1", expires_in: 60 },
				{ status: 201 },
			),
		);
		const url = await pushAuthorizationRequest({
			authorizationURL,
			authorizationEndpoint:
				"https://as.example.com/authorize?tenant=acme%20inc&value=~",
			pushedAuthorizationRequestEndpoint: "https://as.example.com/par",
			options: { clientId: "client" },
			tokenEndpointAuth: { method: "none" },
		});

		expect(url.href).toBe(
			"https://as.example.com/authorize?tenant=acme%20inc&value=~&client_id=client&request_uri=urn%3Aexample%3A1",
		);
		const [input, init] = fetchMock.mock.calls[0]!;
		expect(String(input)).toBe("https://as.example.com/par");
		expect(init?.method).toBe("POST");
		const body = new URLSearchParams(String(init?.body));
		expect(Object.fromEntries(body)).toEqual({
			response_type: "code",
			client_id: "client",
			state: "abc",
		});
	});

	it("refuses a redirect from the pushed authorization request endpoint", async () => {
		respondWith(
			new Response(null, {
				status: 307,
				headers: { location: "https://internal.example.com/par" },
			}),
		);
		await expect(
			pushAuthorizationRequest({
				authorizationURL,
				authorizationEndpoint: "https://as.example.com/authorize",
				pushedAuthorizationRequestEndpoint: "https://as.example.com/par",
				options: { clientId: "client" },
				tokenEndpointAuth: { method: "none" },
			}),
		).rejects.toThrow("returned an HTTP redirect");
	});
	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9126#section-2.1
	 */
	it("refuses to push an authorization request that already has a request_uri", async () => {
		const fetchMock = respondWith(
			Response.json({ request_uri: "urn:example:1" }, { status: 201 }),
		);
		const withRequestUri = new URL(authorizationURL);
		withRequestUri.searchParams.set("request_uri", "urn:example:attacker");

		await expect(
			pushAuthorizationRequest({
				authorizationURL: withRequestUri,
				authorizationEndpoint: "https://as.example.com/authorize",
				pushedAuthorizationRequestEndpoint: "https://as.example.com/par",
				options: { clientId: "client" },
				tokenEndpointAuth: { method: "none" },
			}),
		).rejects.toThrow("request_uri");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
