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

	it("keeps query parameters already on the authorization endpoint", async () => {
		respondWith(
			Response.json(
				{ request_uri: "urn:example:1", expires_in: 60 },
				{ status: 201 },
			),
		);
		const url = await pushAuthorizationRequest({
			authorizationURL,
			authorizationEndpoint: "https://as.example.com/authorize?tenant=acme",
			pushedAuthorizationRequestEndpoint: "https://as.example.com/par",
			options: { clientId: "client" },
			tokenEndpointAuth: { method: "none" },
		});

		expect(url.href).toBe(
			"https://as.example.com/authorize?tenant=acme&client_id=client&request_uri=urn%3Aexample%3A1",
		);
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
});
