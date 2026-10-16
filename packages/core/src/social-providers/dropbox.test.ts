import { assertType, expect, expectTypeOf, it } from "vitest";
import type { DropboxProfile } from "./dropbox";
import { dropbox } from "./dropbox";

/**
 * @see https://github.com/dropbox/dropbox-api-spec/blob/404afad5c508a45ea9004c9d8c0cd4a56f0fbf22/users.stone#L123-L181
 */
it("accepts Dropbox accounts without a profile photo", async () => {
	const profile = {
		account_id: "dropbox-user",
		name: {
			given_name: "Jane",
			surname: "Doe",
			familiar_name: "Jane",
			display_name: "Jane Doe",
			abbreviated_name: "JD",
		},
		email: "jane@example.com",
		email_verified: true,
		disabled: false,
		locale: "en",
		referral_link: "https://db.tt/example",
		is_paired: false,
		account_type: { ".tag": "basic" as const },
		root_info: {
			".tag": "user" as const,
			root_namespace_id: "123",
			home_namespace_id: "123",
		},
	};
	assertType<DropboxProfile>(profile);
	const provider = dropbox({
		clientId: "dropbox-app",
		getUserInfo: async () => ({
			user: {
				name: profile.name.display_name,
				email: profile.email,
				emailVerified: true,
			},
			data: profile,
		}),
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });

	expect(result?.data.account_id).toBe("dropbox-user");
});

/**
 * @see https://github.com/dropbox/dropbox-api-spec/blob/3c363a594dafbe0f4646e73352b62a4767540d25/users.stone#L179-L206
 */
it("types the current Dropbox account", () => {
	expectTypeOf<DropboxProfile["disabled"]>().toEqualTypeOf<boolean>();
	expectTypeOf<DropboxProfile["locale"]>().toEqualTypeOf<string>();
	expectTypeOf<DropboxProfile["is_paired"]>().toEqualTypeOf<boolean>();
	assertType<DropboxProfile["root_info"]>({
		".tag": "team",
		root_namespace_id: "123",
		home_namespace_id: "456",
		home_path: "/Jane",
	});
});
