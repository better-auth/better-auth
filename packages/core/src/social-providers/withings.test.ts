import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { withings } from "./withings";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "withings-app",
	clientSecret: "withings-secret",
};

describe("withings.getUserInfo (no provider email)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("synthesizes a non-routable placeholder email keyed to userid", async () => {
		const provider = withings(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
			userid: 123456,
		} as any);

		expect(res?.user.id).toBe("123456");
		expect(res?.user.email).toBe("123456@withings.invalid");
		expect(res?.user.emailVerified).toBe(false);
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("lets mapProfileToUser supply a real email", async () => {
		const provider = withings({
			...options,
			mapProfileToUser: () => ({ email: "real@example.com" }),
		});
		const res = await provider.getUserInfo({
			accessToken: "access-token",
			userid: "789",
		} as any);

		expect(res?.user.email).toBe("real@example.com");
	});

	it("returns null when the token carries no userid", async () => {
		const provider = withings(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
		} as any);

		expect(res).toBeNull();
	});
});

describe("withings.validateAuthorizationCode", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("unwraps the { status, body } envelope and carries userid", async () => {
		mockedBetterFetch.mockResolvedValue({
			data: {
				status: 0,
				body: {
					userid: 42,
					access_token: "at",
					refresh_token: "rt",
					expires_in: 10800,
					scope: "user.info,user.metrics",
					token_type: "Bearer",
				},
			},
			error: null,
		} as any);

		const provider = withings(options);
		const tokens = await provider.validateAuthorizationCode({
			code: "code",
			redirectURI: "https://example.com/callback",
		} as any);

		expect(tokens.accessToken).toBe("at");
		expect(tokens.refreshToken).toBe("rt");
		expect(tokens.scopes).toEqual(["user.info", "user.metrics"]);
		expect((tokens as any).userid).toBe(42);
		expect(tokens.accessTokenExpiresAt).toBeInstanceOf(Date);
	});

	it("throws when Withings returns a non-zero status", async () => {
		mockedBetterFetch.mockResolvedValue({
			data: { status: 503, error: "invalid_grant" },
			error: null,
		} as any);

		const provider = withings(options);
		await expect(
			provider.validateAuthorizationCode({
				code: "bad",
				redirectURI: "https://example.com/callback",
			} as any),
		).rejects.toThrow(/invalid_grant/);
	});
});
