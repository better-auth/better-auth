import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { LinearUser } from "./linear";
import { linear } from "./linear";

/**
 * @see https://linear.app/developers/oauth-2-0-authentication
 */
it("joins authorization scopes with commas", async () => {
	const provider = linear({ clientId: "app", scope: ["write"] });
	const url = await provider.createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
		scopes: ["comments:create"],
	});
	expect(url.searchParams.get("scope")).toBe("read,write,comments:create");
	const custom = await linear({
		clientId: "app",
		disableDefaultScope: true,
		scope: ["write", "comments:create"],
	}).createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
	});
	expect(custom.searchParams.get("scope")).toBe("write,comments:create");
});

vi.mock(import("@better-fetch/fetch"), () => ({ betterFetch: vi.fn() }));
const mockedBetterFetch = vi.mocked(betterFetch);
const credentials = {
	clientId: "provider-client",
	clientSecret: "provider-secret",
};
beforeEach(() => mockedBetterFetch.mockReset());

/**
 * @see https://github.com/linear/linear/blob/a983882e6ca94ad3d271d61273a50b1d660d1fdb/packages/sdk/src/schema.graphql#L49313-L49317
 * @see https://linear.app/developers/graphql
 */
describe("linear viewer avatars", () => {
	it.each([null, "https://example.com/avatar.png"])(
		"normalizes the local image for avatar %s",
		async (avatarUrl) => {
			const viewer = {
				id: "linear-user",
				name: "Linear User",
				email: "user@example.com",
				avatarUrl,
				active: true,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-02T00:00:00.000Z",
			} satisfies LinearUser;
			mockedBetterFetch.mockResolvedValueOnce({
				data: { data: { viewer } },
				error: null,
			});
			const mapProfileToUser = vi.fn((profile: LinearUser) => {
				expectTypeOf(profile.avatarUrl).toEqualTypeOf<string | null>();
				expectTypeOf(profile.createdAt).toEqualTypeOf<string>();
				expectTypeOf(profile.updatedAt).toEqualTypeOf<string>();
				return {};
			});
			const provider = linear({ ...credentials, mapProfileToUser });
			const tokens = { accessToken: "linear-token" };
			const result = await provider.getUserInfo(tokens);

			expect(result?.user.image).toBe(avatarUrl ?? undefined);
			expect(result?.user.emailVerified).toBe(false);
			expect(result?.data).toEqual(viewer);
			expect(mapProfileToUser).toHaveBeenCalledWith(viewer);
			expect(provider.accountSubject({ tokens, profile: viewer })).toBe(
				"linear-user",
			);
		},
	);

	it("lets profile mapping replace a missing avatar", async () => {
		const viewer = {
			id: "linear-user",
			name: "Linear User",
			email: "user@example.com",
			avatarUrl: null,
			active: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
		} satisfies LinearUser;
		mockedBetterFetch.mockResolvedValueOnce({
			data: { data: { viewer } },
			error: null,
		});
		const result = await linear({
			...credentials,
			mapProfileToUser: () => ({ image: "https://example.com/mapped.png" }),
		}).getUserInfo({ accessToken: "linear-token" });

		expect(result?.user.image).toBe("https://example.com/mapped.png");
		expect(result?.data.avatarUrl).toBeNull();
	});
});
