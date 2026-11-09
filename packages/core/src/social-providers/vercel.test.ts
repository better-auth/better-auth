import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import { CLIENT_ASSERTION_TYPE } from "../oauth2";
import { vercel } from "./vercel";

const mockedBetterFetch = vi.mocked(betterFetch);
const clientId = "vercel-client";
const tokenEndpoint = "https://api.vercel.com/login/oauth/token";
const oidcAssertionType =
	"urn:vercel:params:oauth:client-assertion-type:oidc-bearer";
const callback = {
	code: "authorization-code",
	codeVerifier: "v".repeat(64),
	redirectURI: "https://app.example/api/auth/callback/vercel",
};

beforeEach(() => {
	mockedBetterFetch.mockReset();
	mockedBetterFetch.mockResolvedValue({
		data: {
			access_token: "access-token",
			token_type: "Bearer",
			expires_in: 3600,
		},
		error: null,
	});
});

describe("Vercel token endpoint authentication", () => {
	it("preserves the default client secret exchange", async () => {
		const provider = vercel({ clientId, clientSecret: "client-secret" });

		const tokens = await provider.validateAuthorizationCode(callback);

		expect(tokens.accessToken).toBe("access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0]!;
		expect(url).toBe(tokenEndpoint);
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			grant_type: "authorization_code",
			code: callback.code,
			code_verifier: callback.codeVerifier,
			redirect_uri: callback.redirectURI,
			client_id: clientId,
			client_secret: "client-secret",
		});
	});

	it("awaits a current OIDC assertion for every exchange and preserves PKCE", async () => {
		const getOidcToken = vi
			.fn<() => Promise<string>>()
			.mockResolvedValueOnce("first-oidc-token")
			.mockResolvedValueOnce("second-oidc-token");
		const provider = vercel({
			clientId,
			tokenEndpointAuth: {
				method: "custom",
				async customizeRequest(context) {
					expect(context.tokenEndpoint).toBe(tokenEndpoint);
					expect(context.grantType).toBe("authorization_code");
					context.body.set("client_id", clientId);
					context.body.set("client_assertion", await getOidcToken());
					context.body.set("client_assertion_type", oidcAssertionType);
				},
			},
		});

		const url = await provider.createAuthorizationURL({
			state: "oauth-state",
			codeVerifier: callback.codeVerifier,
			redirectURI: callback.redirectURI,
		});
		expect(getOidcToken).not.toHaveBeenCalled();
		expect(url.searchParams.get("state")).toBe("oauth-state");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
		expect(url.searchParams.has("client_assertion")).toBe(false);

		for (const assertion of ["first-oidc-token", "second-oidc-token"]) {
			const tokens = await provider.validateAuthorizationCode(callback);
			expect(tokens.accessToken).toBe("access-token");
			const [requestUrl, init] = mockedBetterFetch.mock.lastCall!;
			expect(requestUrl).toBe(tokenEndpoint);
			expect(init?.method).toBe("POST");
			expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
				grant_type: "authorization_code",
				code: callback.code,
				code_verifier: callback.codeVerifier,
				redirect_uri: callback.redirectURI,
				client_id: clientId,
				client_assertion: assertion,
				client_assertion_type: oidcAssertionType,
			});
			expect(
				Object.keys(init?.headers ?? {}).map((name) => name.toLowerCase()),
			).not.toContain("authorization");
		}
		expect(getOidcToken).toHaveBeenCalledTimes(2);
	});

	it("does not send a token request when the assertion callback fails", async () => {
		const error = new Error("OIDC token is unavailable");
		const provider = vercel({
			clientId,
			tokenEndpointAuth: {
				method: "custom",
				customizeRequest: vi.fn().mockRejectedValue(error),
			},
		});

		await expect(provider.validateAuthorizationCode(callback)).rejects.toBe(
			error,
		);
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("supports managed private key assertions through the shared strategy", async () => {
		const getClientAssertion = vi.fn(async () => "signed-client-assertion");
		const provider = vercel({
			clientId,
			tokenEndpointAuth: { method: "private_key_jwt", getClientAssertion },
		});

		await provider.validateAuthorizationCode(callback);

		expect(getClientAssertion).toHaveBeenCalledWith({
			clientId,
			tokenEndpoint,
			grantType: "authorization_code",
		});
		const [, init] = mockedBetterFetch.mock.calls[0]!;
		const body = init?.body as URLSearchParams;
		expect(body.get("client_id")).toBe(clientId);
		expect(body.get("client_assertion")).toBe("signed-client-assertion");
		expect(body.get("client_assertion_type")).toBe(CLIENT_ASSERTION_TYPE);
		expect(body.has("client_secret")).toBe(false);
		expect(
			Object.keys(init?.headers ?? {}).map((name) => name.toLowerCase()),
		).not.toContain("authorization");
	});

	it.each(["private_key_jwt", "none"] as const)(
		"rejects %s combined with a client secret when the provider is created",
		(method) => {
			const getClientAssertion = vi.fn(async () => "signed-client-assertion");
			expect(() =>
				vercel({
					clientId,
					clientSecret: "client-secret",
					tokenEndpointAuth:
						method === "none" ? { method } : { method, getClientAssertion },
				}),
			).toThrow(
				`Vercel ${method} token endpoint authentication cannot be combined with clientSecret`,
			);
			expect(getClientAssertion).not.toHaveBeenCalled();
			expect(mockedBetterFetch).not.toHaveBeenCalled();
		},
	);

	it.each(["client_secret_basic", "client_secret_post"] as const)(
		"requires a secret for explicit %s authentication when the provider is created",
		(method) => {
			expect(() => vercel({ clientId, tokenEndpointAuth: { method } })).toThrow(
				`Vercel ${method} token endpoint authentication requires clientSecret`,
			);
			expect(mockedBetterFetch).not.toHaveBeenCalled();
		},
	);

	it("rejects incomplete custom assertion parameters before sending the request", async () => {
		const provider = vercel({
			clientId,
			tokenEndpointAuth: {
				method: "custom",
				customizeRequest({ body }) {
					body.set("client_id", clientId);
					body.set("client_assertion", "oidc-token");
				},
			},
		});

		await expect(provider.validateAuthorizationCode(callback)).rejects.toThrow(
			"client_assertion and client_assertion_type must both be provided",
		);
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});
});
