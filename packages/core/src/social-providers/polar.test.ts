import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { PolarProfile } from "./polar";
import { polar } from "./polar";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

const mockedBetterFetch = vi.mocked(betterFetch);
const options = { clientId: "polar-client", clientSecret: "polar-secret" };

/**
 * @see https://polar.sh/docs/api-reference/oauth2/connect/get-user-info
 */
describe("Polar userinfo profiles", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("uses the userinfo subject for account identity", async () => {
		const profile = {
			sub: "polar-user",
			email: "user@example.com",
			email_verified: true,
		} satisfies PolarProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const provider = polar(options);
		const tokens = { accessToken: "polar-access-token" };
		const result = await provider.getUserInfo(tokens);

		expect(result?.user.email).toBe("user@example.com");
		expect(result?.user.emailVerified).toBe(true);
		expect(result?.data).toEqual(profile);
		expect(provider.accountSubject({ tokens, profile })).toBe("polar-user");
	});

	it("maps an organization name without an email", async () => {
		const profile = {
			sub: "polar-organization",
			name: "organization-slug",
		} satisfies PolarProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const result = await polar(options).getUserInfo({ accessToken: "token" });

		expect(result?.user.name).toBe("organization-slug");
		expect(result?.user.email).toBeUndefined();
		expect(result?.user.emailVerified).toBe(false);
		expect(result?.data).toEqual(profile);
	});

	it("lets profile mapping supply an email for a subject-only response", async () => {
		const profile = { sub: "polar-user" } satisfies PolarProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const mapProfileToUser = vi.fn((claims: PolarProfile) => ({
			name: "Mapped User",
			email: `${claims.sub}@example.com`,
		}));
		const result = await polar({ ...options, mapProfileToUser }).getUserInfo({
			accessToken: "token",
		});

		expect(mapProfileToUser).toHaveBeenCalledWith(profile);
		expect(result?.user).toMatchObject({
			name: "Mapped User",
			email: "polar-user@example.com",
			emailVerified: false,
		});
		expect(result?.data).toEqual(profile);
	});

	it("preserves nullable claims and profile mapping overrides", async () => {
		const profile = {
			sub: "polar-user",
			name: null,
			email: null,
			email_verified: null,
		} satisfies PolarProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const mapProfileToUser = vi.fn(() => ({
			name: "Mapped User",
			email: "mapped@example.com",
			image: "https://example.com/avatar.png",
		}));
		const result = await polar({ ...options, mapProfileToUser }).getUserInfo({
			accessToken: "token",
		});

		expect(mapProfileToUser).toHaveBeenCalledWith(profile);
		expect(result?.data).toEqual(profile);
		expect(result?.user).toEqual({
			name: "Mapped User",
			email: "mapped@example.com",
			image: "https://example.com/avatar.png",
			emailVerified: false,
		});
	});

	it("exposes nullable optional claims in profile mapping", () => {
		polar({
			...options,
			mapProfileToUser(profile) {
				expectTypeOf(profile.sub).toEqualTypeOf<string>();
				expectTypeOf(profile.name).toEqualTypeOf<string | null | undefined>();
				expectTypeOf(profile.email).toEqualTypeOf<string | null | undefined>();
				expectTypeOf(profile.email_verified).toEqualTypeOf<
					boolean | null | undefined
				>();
				return {};
			},
		});
	});
});
