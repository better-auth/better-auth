import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { logger } from "../env";
import type { LinkOptions, LinkProfile } from "./link";
import { link } from "./link";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "link-client-id",
	clientSecret: "link-client-secret",
	publishableKey: "pk_live_link",
};

const authorizationInput = {
	state: "state-value",
	codeVerifier: "v".repeat(64),
	redirectURI: "https://example.com/api/auth/callback/link",
};

beforeEach(() => {
	mockedBetterFetch.mockReset();
	vi.restoreAllMocks();
});

describe("LinkOptions", () => {
	it("requires confidential client credentials and a publishable key", () => {
		expectTypeOf<typeof options>().toMatchTypeOf<LinkOptions>();
		expectTypeOf<{
			clientId: string;
			clientSecret: string;
		}>().not.toMatchTypeOf<LinkOptions>();
		expectTypeOf<{
			clientId: string;
			publishableKey: string;
		}>().not.toMatchTypeOf<LinkOptions>();
	});
});

describe("link authorization", () => {
	it("creates an authorization URL with payment scopes, PKCE, and the publishable key", async () => {
		const url = await link(options).createAuthorizationURL(authorizationInput);

		expect(url.origin).toBe("https://login.link.com");
		expect(url.pathname).toBe("/auth");
		expect(url.searchParams.get("client_id")).toBe(options.clientId);
		expect(url.searchParams.get("key")).toBe(options.publishableKey);
		expect(url.searchParams.get("redirect_uri")).toBe(
			authorizationInput.redirectURI,
		);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")).toBe(
			"payment_methods.agentic userinfo:read",
		);
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
	});

	it("deduplicates scopes and safely forwards authorization details", async () => {
		const authorizationDetails = JSON.stringify([
			{ type: "source", actions: ["read_balances"] },
		]);
		const url = await link({
			...options,
			scope: ["payment_methods.agentic", "custom:read"],
		}).createAuthorizationURL({
			...authorizationInput,
			scopes: ["userinfo:read"],
			additionalParams: {
				key: "pk_injected",
				custom: "value",
				authorization_details: authorizationDetails,
			},
		});

		expect(url.searchParams.get("scope")).toBe(
			"payment_methods.agentic userinfo:read custom:read",
		);
		expect(url.searchParams.get("key")).toBe(options.publishableKey);
		expect(url.searchParams.get("custom")).toBe("value");
		expect(url.searchParams.get("authorization_details")).toBe(
			authorizationDetails,
		);
	});

	it("requires PKCE", () => {
		expect(() =>
			link(options).createAuthorizationURL({
				...authorizationInput,
				codeVerifier: "",
			}),
		).toThrow("codeVerifier is required for Link");
	});

	it("rejects a scope-less authorization request", () => {
		expect(() =>
			link({
				...options,
				disableDefaultScope: true,
			}).createAuthorizationURL(authorizationInput),
		).toThrow("At least one scope is required for Link");
	});
});

describe("link token requests", () => {
	it("exchanges an authorization code with the publishable key and client credentials", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				refresh_token: "refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
				scope: "payment_methods.agentic userinfo:read",
			},
			error: null,
		});

		const tokens = await link(options).validateAuthorizationCode({
			code: "authorization-code",
			codeVerifier: authorizationInput.codeVerifier,
			redirectURI: authorizationInput.redirectURI,
		});

		expect(tokens?.accessToken).toBe("access-token");
		expect(tokens?.scopes).toEqual([
			"payment_methods.agentic",
			"userinfo:read",
		]);
		expect(tokens?.accessTokenExpiresAt).toBeInstanceOf(Date);
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://login.link.com/auth/token");
		expect(new Headers(init?.headers as HeadersInit).get("authorization")).toBe(
			`Bearer ${options.publishableKey}`,
		);
		expect(init?.body).toBeInstanceOf(URLSearchParams);
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			code: "authorization-code",
			code_verifier: authorizationInput.codeVerifier,
			grant_type: "authorization_code",
			redirect_uri: authorizationInput.redirectURI,
		});
	});

	it("does not exchange an authorization code without the PKCE verifier", async () => {
		await expect(
			link(options).validateAuthorizationCode({
				code: "authorization-code",
				redirectURI: authorizationInput.redirectURI,
			}),
		).rejects.toThrow("codeVerifier is required for Link");
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("refreshes an access token with the publishable key and client credentials", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "refreshed-access-token",
				refresh_token: "rotated-refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
			},
			error: null,
		});

		const tokens = await link(options).refreshAccessToken("refresh-token");

		expect(tokens.refreshToken).toBe("rotated-refresh-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://login.link.com/auth/token");
		expect(new Headers(init?.headers as HeadersInit).get("authorization")).toBe(
			`Bearer ${options.publishableKey}`,
		);
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			grant_type: "refresh_token",
			refresh_token: "refresh-token",
		});
	});

	it("revokes a refresh token with the confidential client credentials", async () => {
		mockedBetterFetch.mockResolvedValueOnce({ data: {}, error: null });

		await link(options).revokeToken("refresh-token");

		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://login.link.com/auth/revoke");
		expect(init?.redirect).toBe("manual");
		expect(new Headers(init?.headers as HeadersInit).get("authorization")).toBe(
			`Bearer ${options.publishableKey}`,
		);
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			token: "refresh-token",
			token_type_hint: "refresh_token",
		});
	});
});

describe("link.getUserInfo", () => {
	it("maps the Link profile and uses immutable email as the account subject", async () => {
		const profile = {
			email: "link@example.com",
			name: "Link User",
			first_name: "Link",
			last_name: "User",
			phone: "+15555550123",
		} satisfies LinkProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });

		const provider = link(options);
		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://api.link.com/userinfo",
			{ headers: { authorization: "Bearer access-token" } },
		);
		expect(result?.user).toEqual({
			name: "Link User",
			email: "link@example.com",
			emailVerified: false,
		});
		expect(result?.user).not.toHaveProperty("id");
		if (!result) return;
		expect(
			provider.accountSubject({
				tokens: { accessToken: "access-token" },
				profile: result.data,
			}),
		).toBe("link@example.com");
	});

	it("builds a name from profile name fields and falls back to email", async () => {
		mockedBetterFetch
			.mockResolvedValueOnce({
				data: {
					email: "partial@example.com",
					first_name: "Partial",
				} satisfies LinkProfile,
				error: null,
			})
			.mockResolvedValueOnce({
				data: { email: "nameless@example.com" } satisfies LinkProfile,
				error: null,
			});

		const provider = link(options);
		expect(
			(await provider.getUserInfo({ accessToken: "first-token" }))?.user.name,
		).toBe("Partial");
		expect(
			(await provider.getUserInfo({ accessToken: "second-token" }))?.user.name,
		).toBe("nameless@example.com");
	});

	it.each([
		{
			name: "the request fails",
			response: {
				data: null,
				error: {
					message: "Unauthorized",
					status: 401,
					statusText: "Unauthorized",
				},
			},
		},
		{
			name: "the profile does not include an email",
			response: {
				data: { name: "Missing Email" } satisfies LinkProfile,
				error: null,
			},
		},
	])("returns null when $name", async ({ response }) => {
		const loggerError = vi.spyOn(logger, "error").mockImplementation(() => {});
		mockedBetterFetch.mockResolvedValueOnce(response);

		const result = await link(options).getUserInfo({
			accessToken: "access-token",
		});

		expect(result).toBeNull();
		expect(loggerError).toHaveBeenCalledOnce();
	});
});
