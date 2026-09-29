import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { reddit } from "./reddit";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "reddit-app",
	clientSecret: "reddit-secret",
};

function profileResponse(profile: Record<string, unknown>) {
	return { data: profile, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

function formBody(body: unknown) {
	if (body instanceof URLSearchParams) return body;
	if (typeof body === "string") return new URLSearchParams(body);
	throw new Error("Expected a URL-encoded form body");
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-2.3.1
 */
describe("reddit token requests", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("exchanges an authorization code with Basic authentication", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				expires_in: 3600,
				refresh_token: "refresh-token",
				token_type: "bearer",
			},
			error: null,
		});

		const tokens = await reddit(options).validateAuthorizationCode({
			code: "authorization-code",
			redirectURI: "https://app.example.com/api/auth/callback/reddit",
		});

		expect(tokens?.accessToken).toBe("access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://www.reddit.com/api/v1/access_token");
		const headers = new Headers(init?.headers as HeadersInit | undefined);
		expect(headers.get("accept")).toBe("text/plain");
		expect(headers.get("authorization")).toBe(
			`Basic ${Buffer.from("reddit-app:reddit-secret").toString("base64")}`,
		);
		expect(headers.get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(headers.has("user-agent")).toBe(true);
		expect(init?.redirect).toBe("manual");
		expect(Object.fromEntries(formBody(init?.body))).toEqual({
			code: "authorization-code",
			grant_type: "authorization_code",
			redirect_uri: "https://app.example.com/api/auth/callback/reddit",
		});
	});

	it("refreshes an access token with Basic authentication", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "refreshed-access-token",
				expires_in: 3600,
				token_type: "bearer",
			},
			error: null,
		});

		const tokens = await reddit(options).refreshAccessToken("refresh-token");

		expect(tokens.accessToken).toBe("refreshed-access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://www.reddit.com/api/v1/access_token");
		const headers = new Headers(init?.headers as HeadersInit | undefined);
		expect(headers.get("accept")).toBe("application/json");
		expect(headers.get("authorization")).toBe(
			`Basic ${Buffer.from("reddit-app:reddit-secret").toString("base64")}`,
		);
		expect(headers.get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(init?.redirect).toBe("manual");
		expect(Object.fromEntries(formBody(init?.body))).toEqual({
			grant_type: "refresh_token",
			refresh_token: "refresh-token",
		});
	});
});

describe("reddit.getUserInfo (no provider email)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("creates a non-routable placeholder email and never trusts oauth_client_id", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "reddit-user-1",
				name: "spez",
				icon_img: "https://example.com/avatar.png",
				has_verified_email: true,
				oauth_client_id: "shared-app-client-id",
				verified: true,
			}),
		);
		const provider = reddit(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
		} as any);

		expect(res?.user.email).toBe("reddit-user-1@reddit.placeholder.invalid");
		// `has_verified_email` describes the user's real Reddit email, not the
		// placeholder, so it must never be marked verified.
		expect(res?.user.emailVerified).toBe(false);
		// The OAuth app's client id must never become the user's identity anchor.
		expect(res?.user.email).not.toContain("shared-app-client-id");
	});

	it("gives distinct users distinct placeholder emails", async () => {
		const provider = reddit(options);

		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "user-a",
				name: "a",
				icon_img: null,
				has_verified_email: true,
				oauth_client_id: "same-client",
				verified: true,
			}),
		);
		const a = await provider.getUserInfo({ accessToken: "t-a" } as any);

		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "user-b",
				name: "b",
				icon_img: null,
				has_verified_email: true,
				oauth_client_id: "same-client",
				verified: true,
			}),
		);
		const b = await provider.getUserInfo({ accessToken: "t-b" } as any);

		expect(a?.user.email).toBe("user-a@reddit.placeholder.invalid");
		expect(b?.user.email).toBe("user-b@reddit.placeholder.invalid");
		expect(a?.user.email).not.toBe(b?.user.email);
	});

	it("lets mapProfileToUser supply a real email", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "reddit-user-2",
				name: "mapped",
				icon_img: null,
				has_verified_email: true,
				oauth_client_id: "client",
				verified: true,
			}),
		);
		const provider = reddit({
			...options,
			mapProfileToUser: () => ({ email: "real@example.com" }),
		});
		const res = await provider.getUserInfo({ accessToken: "t" } as any);

		expect(res?.user.email).toBe("real@example.com");
	});
});
