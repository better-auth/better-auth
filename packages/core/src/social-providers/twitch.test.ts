import { UnsecuredJWT } from "jose";
import { afterEach, assertType, beforeEach, expect, it, vi } from "vitest";
import type { TwitchProfile } from "./twitch";
import { twitch } from "./twitch";

const options = { clientId: "provider-client", clientSecret: "secret" };
const endpoint = "https://api.twitch.tv/helix/users";
const profile = {
	sub: "provider-user",
	preferred_username: "Provider User",
	email: "user@example.com",
	email_verified: true,
	picture: "https://example.com/avatar.png",
} satisfies TwitchProfile;
const mockedFetch = vi.fn<typeof fetch>();
beforeEach(() => {
	mockedFetch.mockReset();
	mockedFetch.mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		expect(request.url).toBe(endpoint);
		expect(request.headers.get("authorization")).toBe("Bearer access-token");
		expect(request.headers.get("client-id")).toBe(options.clientId);
		return Response.json({
			data: [
				{
					id: profile.sub,
					display_name: profile.preferred_username,
					email: profile.email,
					profile_image_url: profile.picture,
				},
			],
		});
	});
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * @see https://dev.twitch.tv/docs/api/reference/#get-users
 */
it("reads the authenticated profile with only an access token", async () => {
	const result = await twitch(options).getUserInfo({
		accessToken: "access-token",
	});
	expect(result?.data).toEqual(profile);
	expect(result?.user).toEqual({
		name: "Provider User",
		email: profile.email,
		emailVerified: true,
		image: profile.picture,
	});
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
it("uses the access-token response instead of ID-token contents", async () => {
	const result = await twitch(options).getUserInfo({
		accessToken: "access-token",
		idToken: new UnsecuredJWT({
			sub: profile.sub,
			email: "ignored@example.com",
		}).encode(),
	});
	expect(result?.data).toEqual(profile);
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
it("requires an access token even when an ID token is supplied", async () => {
	expect(
		await twitch(options).getUserInfo({
			idToken: new UnsecuredJWT(profile).encode(),
		}),
	).toBeNull();
	expect(mockedFetch).not.toHaveBeenCalled();
});

it.each(["unauthorized", "empty"])(
	"rejects an %s profile response",
	async (kind) => {
		mockedFetch.mockImplementation(async () =>
			kind === "unauthorized"
				? new Response(null, { status: 401 })
				: Response.json({ data: [] }),
		);
		expect(
			await twitch(options).getUserInfo({ accessToken: "access-token" }),
		).toBeNull();
	},
);

it("preserves a custom profile reader without requiring an access token", async () => {
	const custom = {
		user: { email: profile.email, emailVerified: false },
		data: profile,
	};
	const getUserInfo = vi.fn(async () => custom);
	const tokens = { idToken: "custom-id-token" };
	expect(await twitch({ ...options, getUserInfo }).getUserInfo(tokens)).toBe(
		custom,
	);
	expect(getUserInfo).toHaveBeenCalledWith(tokens);
	expect(mockedFetch).not.toHaveBeenCalled();
});

/**
 * @see https://dev.twitch.tv/docs/api/reference/#get-users
 */
it("lets profile mappings supply missing email access", async () => {
	mockedFetch.mockImplementation(async () =>
		Response.json({
			data: [
				{
					id: profile.sub,
					display_name: "Provider User",
					profile_image_url: profile.picture,
				},
			],
		}),
	);
	const result = await twitch({
		...options,
		mapProfileToUser: (claims) => ({ email: `${claims.sub}@example.com` }),
	}).getUserInfo({ accessToken: "access-token" });
	expect(result?.user.email).toBe("provider-user@example.com");
	expect(result?.user.emailVerified).toBe(false);
	assertType<TwitchProfile>({ sub: "provider-user", email_verified: false });
});

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
 */
it.each([
	{ kind: "malformed", token: "invalid-id-token" },
	{
		kind: "mismatched",
		token: new UnsecuredJWT({ sub: "different-user" }).encode(),
	},
])("rejects a $kind supplied ID token", async ({ token }) => {
	expect(
		await twitch(options).getUserInfo({
			accessToken: "access-token",
			idToken: token,
		}),
	).toBeNull();
});
