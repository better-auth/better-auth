import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import type { SlackProfile } from "./slack";
import { slack } from "./slack";

const mockedFetch = vi.fn<typeof fetch>();
const credentials = {
	clientId: "provider-client",
	clientSecret: "provider-secret",
};
beforeEach(() => {
	mockedFetch.mockReset();
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * @see https://docs.slack.dev/authentication/sign-in-with-slack/
 * @see https://docs.slack.dev/reference/methods/openid.connect.userInfo/
 * @see https://github.com/slackapi/node-slack-sdk/blob/571bc3a617d1455e691955527fc01bde20662e7d/packages/web-api/src/types/response/OpenIDConnectUserInfoResponse.ts#L11-L47
 */
describe("slack optional profile claims", () => {
	it("keeps identity-only profiles available to profile mapping", async () => {
		const profile = {
			ok: true,
			sub: "U123",
			"https://slack.com/user_id": "U123",
			"https://slack.com/team_id": "T123",
		} satisfies SlackProfile;
		mockedFetch.mockImplementationOnce(async (input, init) => {
			const request = new Request(input, init);
			expect(request.url).toBe("https://slack.com/api/openid.connect.userInfo");
			expect(request.method).toBe("POST");
			expect(request.headers.get("authorization")).toBe("Bearer slack-token");
			return Response.json(profile);
		});
		const provider = slack({
			...credentials,
			disableDefaultScope: true,
			scope: ["openid"],
			mapProfileToUser(claims) {
				expectTypeOf(claims.email_verified).toEqualTypeOf<
					boolean | undefined
				>();
				expectTypeOf(claims.date_email_verified).toEqualTypeOf<
					number | undefined
				>();
				expectTypeOf(
					claims["https://slack.com/team_image_default"],
				).toEqualTypeOf<boolean | undefined>();
				expectTypeOf(claims["custom:attribute"]).toBeUnknown();
				return { email: `${claims["https://slack.com/user_id"]}@example.com` };
			},
		});
		const tokens = { accessToken: "slack-token" };
		const result = await provider.getUserInfo(tokens);

		expect(result?.user).toMatchObject({
			name: "",
			email: "U123@example.com",
			emailVerified: false,
			image: undefined,
		});
		expect(result?.data).toEqual(profile);
		expect(provider.accountSubject({ tokens, profile })).toBe("U123");
	});

	it.each([true, false])(
		"keeps supplied verification %s and image fallback",
		async (verified) => {
			const profile = {
				ok: true,
				sub: "U123",
				"https://slack.com/user_id": "U123",
				"https://slack.com/team_id": "T123",
				email: "user@example.com",
				email_verified: verified,
				"https://slack.com/user_image_512": "https://example.com/avatar.png",
			} satisfies SlackProfile;
			mockedFetch.mockResolvedValueOnce(Response.json(profile));
			const result = await slack(credentials).getUserInfo({
				accessToken: "token",
			});

			expect(result?.user.emailVerified).toBe(verified);
			expect(result?.user.image).toBe("https://example.com/avatar.png");
			expect(result?.data).toEqual(profile);
		},
	);

	it("rejects HTTP 200 platform errors before profile mapping", async () => {
		mockedFetch.mockResolvedValueOnce(
			Response.json({ ok: false, error: "invalid_auth" }),
		);
		const mapProfileToUser = vi.fn(() => ({}));
		expect(
			await slack({ ...credentials, mapProfileToUser }).getUserInfo({
				accessToken: "slack-token",
			}),
		).toBeNull();
		expect(mapProfileToUser).not.toHaveBeenCalled();
	});
});
