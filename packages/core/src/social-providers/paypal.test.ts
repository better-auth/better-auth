import { betterFetch } from "@better-fetch/fetch";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayPalProfile } from "./paypal";
import { paypal } from "./paypal";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "paypal-client-id",
	clientSecret: "paypal-client-secret",
	environment: "live" as const,
};

const signingKey = new TextEncoder().encode("test-secret");

function profile(subject: string, overrides: Partial<PayPalProfile> = {}) {
	return {
		user_id: subject,
		name: "PayPal User",
		given_name: "PayPal",
		family_name: "User",
		email: "paypal-user@example.com",
		email_verified: true,
		picture: "https://example.com/avatar.png",
		...overrides,
	} satisfies PayPalProfile;
}

function userInfoResponse(data: PayPalProfile) {
	return { data, error: null } as Awaited<
		ReturnType<typeof betterFetch<PayPalProfile>>
	>;
}

async function idToken(subject: string) {
	return new SignJWT({ sub: subject })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(signingKey);
}

function formBody(body: unknown) {
	if (body instanceof URLSearchParams) return body;
	if (typeof body === "string") return new URLSearchParams(body);
	throw new Error("Expected a URL-encoded form body");
}

describe("paypal token requests", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("exchanges an authorization code with Basic authentication", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				expires_in: 3600,
				refresh_token: "refresh-token",
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await paypal(options).validateAuthorizationCode({
			code: "authorization-code",
			codeVerifier: "code-verifier",
			redirectURI: "https://app.example.com/api/auth/callback/paypal",
		});

		expect(tokens.accessToken).toBe("access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://api-m.paypal.com/v1/oauth2/token");
		const headers = new Headers(init?.headers as HeadersInit | undefined);
		expect(headers.get("accept")).toBe("application/json");
		expect(headers.get("authorization")).toBe(
			`Basic ${Buffer.from("paypal-client-id:paypal-client-secret").toString(
				"base64",
			)}`,
		);
		expect(headers.get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(Object.fromEntries(formBody(init?.body))).toEqual({
			code: "authorization-code",
			code_verifier: "code-verifier",
			grant_type: "authorization_code",
			redirect_uri: "https://app.example.com/api/auth/callback/paypal",
		});
	});

	it("refreshes an access token with Basic authentication", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "refreshed-access-token",
				expires_in: 3600,
				refresh_token: "rotated-refresh-token",
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await paypal(options).refreshAccessToken("refresh-token");

		expect(tokens.accessToken).toBe("refreshed-access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://api-m.paypal.com/v1/oauth2/token");
		const headers = new Headers(init?.headers as HeadersInit | undefined);
		expect(headers.get("accept")).toBe("application/json");
		expect(headers.get("authorization")).toBe(
			`Basic ${Buffer.from("paypal-client-id:paypal-client-secret").toString(
				"base64",
			)}`,
		);
		expect(headers.get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(Object.fromEntries(formBody(init?.body))).toEqual({
			grant_type: "refresh_token",
			refresh_token: "refresh-token",
		});
	});
});

describe("paypal.getUserInfo", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("returns user info when the id token subject matches the profile", async () => {
		mockedBetterFetch.mockResolvedValue(
			userInfoResponse(profile("paypal-user-123")),
		);
		const provider = paypal(options);

		const result = await provider.getUserInfo({
			accessToken: "paypal-access-token",
			idToken: await idToken("paypal-user-123"),
		});

		expect(result?.user).not.toHaveProperty("id");
		expect(result?.user.email).toBe("paypal-user@example.com");
		expect(result).not.toBeNull();
		expect(
			await provider.accountSubject({
				tokens: { accessToken: "paypal-access-token" },
				profile: result!.data,
			}),
		).toBe("paypal-user-123");
	});

	it("keeps the PayPal user id when the profile subject matches", async () => {
		mockedBetterFetch.mockResolvedValue(
			userInfoResponse(
				profile("paypal-user-123", {
					sub: "paypal-subject-123",
				}),
			),
		);
		const provider = paypal(options);

		const result = await provider.getUserInfo({
			accessToken: "paypal-access-token",
			idToken: await idToken("paypal-subject-123"),
		});

		expect(result).not.toBeNull();
		expect(
			await provider.accountSubject({
				tokens: { accessToken: "paypal-access-token" },
				profile: result!.data,
			}),
		).toBe("paypal-user-123");
	});

	it("returns null when the id token subject does not match the profile", async () => {
		mockedBetterFetch.mockResolvedValue(
			userInfoResponse(profile("paypal-user-123")),
		);
		const provider = paypal(options);

		const result = await provider.getUserInfo({
			accessToken: "paypal-access-token",
			idToken: await idToken("paypal-user-456"),
		});

		expect(result).toBeNull();
	});

	it("prefers the profile subject over user_id when validating the id token", async () => {
		mockedBetterFetch.mockResolvedValue(
			userInfoResponse(
				profile("paypal-user-123", {
					sub: "paypal-user-456",
				}),
			),
		);
		const provider = paypal(options);

		const result = await provider.getUserInfo({
			accessToken: "paypal-access-token",
			idToken: await idToken("paypal-user-123"),
		});

		expect(result).toBeNull();
	});
});
