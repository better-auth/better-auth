import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { NotionProfile } from "./notion";
import { notion } from "./notion";

vi.mock(import("@better-fetch/fetch"), () => ({ betterFetch: vi.fn() }));
const mockedBetterFetch = vi.mocked(betterFetch);
const credentials = {
	clientId: "provider-client",
	clientSecret: "provider-secret",
};
beforeEach(() => mockedBetterFetch.mockReset());

/**
 * @see https://github.com/makenotion/notion-sdk-js/blob/0ffdbba3004b27438ca72df769412268e4fdede1/src/api-endpoints/common.ts#L79
 * @see https://developers.notion.com/page/changelog#new-identity-fields-in-oauth-token-responses
 */
describe("notion owner profiles", () => {
	it.each([null, "https://example.com/owner.png"])(
		"normalizes the owner's avatar %s without changing raw claims",
		async (avatar_url) => {
			const owner = {
				object: "user",
				id: "notion-owner",
				type: "person",
				name: null,
				avatar_url,
				person: { email: "owner@example.com", email_verified: true },
			} satisfies NotionProfile;
			mockedBetterFetch.mockResolvedValueOnce({
				data: { bot: { owner: { user: owner } } },
				error: null,
			});
			const mapProfileToUser = vi.fn((profile: NotionProfile) => {
				expectTypeOf(profile.name).toEqualTypeOf<string | null | undefined>();
				expectTypeOf(profile.avatar_url).toEqualTypeOf<
					string | null | undefined
				>();
				expectTypeOf(profile.person?.email_verified).toEqualTypeOf<
					boolean | undefined
				>();
				return {};
			});
			const provider = notion({ ...credentials, mapProfileToUser });
			const tokens = { accessToken: "notion-token" };
			const result = await provider.getUserInfo(tokens);

			expect(result?.user).toMatchObject({
				name: "",
				email: "owner@example.com",
				image: avatar_url ?? undefined,
				emailVerified: false,
			});
			expect(result?.data).toEqual(owner);
			expect(mapProfileToUser).toHaveBeenCalledWith(owner);
			expect(provider.accountSubject({ tokens, profile: owner })).toBe(
				"notion-owner",
			);
			expect(mockedBetterFetch).toHaveBeenCalledWith(
				"https://api.notion.com/v1/users/me",
				expect.objectContaining({
					headers: expect.objectContaining({ "Notion-Version": "2022-06-28" }),
				}),
			);
		},
	);

	it("lets profile mapping supply missing fields for a partial owner", async () => {
		const owner = {
			object: "user",
			id: "notion-owner",
		} satisfies NotionProfile;
		mockedBetterFetch.mockResolvedValueOnce({
			data: { bot: { owner: { user: owner } } },
			error: null,
		});
		const provider = notion({
			...credentials,
			mapProfileToUser(profile) {
				expectTypeOf(profile.type).toEqualTypeOf<"person" | undefined>();
				return {
					name: profile.name ?? "Mapped Owner",
					email: profile.person?.email ?? `${profile.id}@example.com`,
					image: "https://example.com/mapped.png",
				};
			},
		});
		const tokens = { accessToken: "notion-token" };
		const result = await provider.getUserInfo(tokens);

		expect(result?.user).toMatchObject({
			name: "Mapped Owner",
			email: "notion-owner@example.com",
			image: "https://example.com/mapped.png",
			emailVerified: false,
		});
		expect(result?.data).toEqual(owner);
		expect(provider.accountSubject({ tokens, profile: owner })).toBe(
			"notion-owner",
		);
	});
});
