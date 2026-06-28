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

		expect(result?.user.id).toBe("paypal-user-123");
		expect(result?.user.email).toBe("paypal-user@example.com");
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

		expect(result?.user.id).toBe("paypal-user-123");
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
