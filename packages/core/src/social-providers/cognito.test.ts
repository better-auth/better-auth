import { betterFetch } from "@better-fetch/fetch";
import { SignJWT } from "jose";
import {
	assertType,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import type { CognitoProfile } from "./cognito";
import { cognito } from "./cognito";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

const mockedBetterFetch = vi.mocked(betterFetch);
const options = {
	clientId: "cognito-client",
	clientSecret: "cognito-secret",
	domain: "example.auth.us-east-1.amazoncognito.com",
	region: "us-east-1",
	userPoolId: "us-east-1_example",
};

/**
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/userinfo-endpoint.html
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html
 */
describe("Cognito profile verification", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it.each([
		["true", true],
		["false", false],
		[undefined, false],
	] as const)("normalizes userinfo verification %s", async (raw, verified) => {
		const profile = {
			sub: "cognito-user",
			email: "user@example.com",
			email_verified: raw,
			phone_number: "+12065551212",
			phone_number_verified: "false",
		} satisfies CognitoProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const result = await cognito(options).getUserInfo({ accessToken: "token" });

		expect(result?.user.emailVerified).toBe(verified);
		expect(result?.data).toEqual(profile);
	});

	it.each([
		[true, true],
		[false, false],
		[undefined, false],
	] as const)("normalizes ID-token verification %s", async (raw, verified) => {
		const profile = {
			sub: "cognito-user",
			email: "user@example.com",
			email_verified: raw,
		} satisfies CognitoProfile;
		const idToken = await new SignJWT(profile)
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer(
				`https://cognito-idp.us-east-1.amazonaws.com/${options.userPoolId}`,
			)
			.setAudience(options.clientId)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode("cognito-signing-key"));
		const result = await cognito(options).getUserInfo({ idToken });

		expect(result?.user.emailVerified).toBe(verified);
		expect(result?.data.email_verified).toBe(raw);
		expect(result?.data.name).toBe("");
	});

	it("lets profile mapping supply missing attributes", async () => {
		const profile = { sub: "cognito-user" } satisfies CognitoProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const result = await cognito({
			...options,
			mapProfileToUser(claims) {
				expectTypeOf(claims.email).toEqualTypeOf<string | undefined>();
				expectTypeOf(claims.name).toEqualTypeOf<string | undefined>();
				expectTypeOf(claims.email_verified).toEqualTypeOf<
					boolean | "true" | "false" | undefined
				>();
				expectTypeOf(claims["custom:department"]).toBeUnknown();
				return { name: "Mapped User", email: `${claims.sub}@example.com` };
			},
		}).getUserInfo({ accessToken: "token" });

		assertType<Pick<CognitoProfile, "aud" | "iss" | "exp" | "iat">>({});
		expect(result?.user).toMatchObject({
			name: "Mapped User",
			email: "cognito-user@example.com",
			emailVerified: false,
		});
		expect(result?.data).toEqual(profile);
	});

	it("preserves raw verification strings and mapping overrides", async () => {
		const profile = {
			sub: "cognito-user",
			email: "user@example.com",
			email_verified: "true",
			"custom:department": "engineering",
		} satisfies CognitoProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const mapProfileToUser = vi.fn((claims: CognitoProfile) => {
			expect(claims.email_verified).toBe("true");
			return { name: "Mapped User", emailVerified: false };
		});
		const result = await cognito({ ...options, mapProfileToUser }).getUserInfo({
			accessToken: "token",
		});

		expect(mapProfileToUser).toHaveBeenCalledWith(profile);
		expect(result?.user.emailVerified).toBe(false);
		expect(result?.user.name).toBe("Mapped User");
		expect(result?.data).toEqual(profile);
	});
});
