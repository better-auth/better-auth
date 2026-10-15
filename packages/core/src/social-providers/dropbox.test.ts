import { assertType, expect, it } from "vitest";
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
