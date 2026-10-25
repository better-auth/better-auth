import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CognitoProfile } from "./cognito";
import { cognito } from "./cognito";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "cognito-client-id",
	clientSecret: "cognito-client-secret",
	domain: "example.auth.us-east-1.amazoncognito.com",
	region: "us-east-1",
	userPoolId: "us-east-1_example",
};

function userInfoResponse(emailVerified: unknown) {
	// The Cognito userinfo endpoint returns email_verified as a string.
	return {
		data: {
			sub: "cognito-user",
			email: "user@example.com",
			email_verified: emailVerified,
			name: "Cognito User",
		} as unknown as CognitoProfile,
		error: null,
	} as Awaited<ReturnType<typeof betterFetch<CognitoProfile>>>;
}

describe("cognito userinfo email_verified", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12024
	 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/userinfo-endpoint.html
	 */
	it("treats the string 'false' as unverified", async () => {
		mockedBetterFetch.mockResolvedValueOnce(userInfoResponse("false"));
		const result = await cognito(options).getUserInfo({
			accessToken: "access-token",
		});
		expect(result?.user.emailVerified).toBe(false);
	});

	it("treats the string 'true' as verified", async () => {
		mockedBetterFetch.mockResolvedValueOnce(userInfoResponse("true"));
		const result = await cognito(options).getUserInfo({
			accessToken: "access-token",
		});
		expect(result?.user.emailVerified).toBe(true);
	});

	it("keeps boolean values unchanged", async () => {
		mockedBetterFetch.mockResolvedValueOnce(userInfoResponse(true));
		const result = await cognito(options).getUserInfo({
			accessToken: "access-token",
		});
		expect(result?.user.emailVerified).toBe(true);
	});
});
