import { betterFetch } from "@better-fetch/fetch";
import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import {
	assertType,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import { verifyProviderIdToken } from "../oauth2";
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
		[true, true],
		[false, false],
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
		["true", true],
		["false", false],
		[undefined, false],
	] as const)("normalizes ID-token verification %s", async (raw, verified) => {
		const profile = {
			sub: "cognito-user",
			email: "user@example.com",
			email_verified: raw,
		} satisfies CognitoProfile;
		const idToken = new UnsecuredJWT(profile).encode();
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

/**
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html
 */
it.each([
	[{ "cognito:username": "cognito-name" }, "cognito-name"],
	[{ name: "Full Name", "cognito:username": "cognito-name" }, "Full Name"],
	[
		{ username: "legacy-name", "cognito:username": "cognito-name" },
		"legacy-name",
	],
])("uses the ID-token username fallback %j", async (claims, name) => {
	const token = new UnsecuredJWT({
		sub: "user",
		token_use: "id",
		...claims,
	}).encode();
	const result = await cognito(options).getUserInfo({ idToken: token });
	expect(result?.user.name).toBe(name);
});

/**
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html
 */
it.each(["cognito-idp", "issuer-cognito-idp", "other-pool"])(
	"verifies the %s issuer",
	async (host) => {
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const trustedIssuer = `https://${host === "other-pool" ? "cognito-idp" : host}.${options.region}.amazonaws.com/${options.userPoolId}`;
		const issuer =
			host === "other-pool"
				? trustedIssuer.replace(options.userPoolId, "us-east-1_other")
				: trustedIssuer;
		const publicJWK = {
			...(await exportJWK(publicKey)),
			kid: "cognito-key",
			alg: "RS256",
		};
		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [publicJWK] },
			error: null,
		});
		const token = await new SignJWT({ sub: "user", token_use: "id" })
			.setProtectedHeader({ alg: "RS256", kid: "cognito-key" })
			.setIssuer(issuer)
			.setAudience(options.clientId)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(privateKey);
		expect(await verifyProviderIdToken(cognito(options), token)).toBe(
			host !== "other-pool",
		);
		expect(mockedBetterFetch).toHaveBeenCalledWith(
			`${trustedIssuer}/.well-known/jwks.json`,
		);
	},
);
