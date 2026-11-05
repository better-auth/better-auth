import { assertType, expect, it } from "vitest";
import type { KickProfile } from "./kick";
import { kick } from "./kick";

/**
 * @see https://api.kick.com/swagger/v1/doc.json
 */
it("accepts numeric user IDs from Kick", async () => {
	const profile = {
		user_id: 123,
		name: "User",
		email: "user@example.com",
		profile_picture: "https://example.com/avatar.png",
	};
	assertType<KickProfile>(profile);
	const provider = kick({
		clientId: "kick-app",
		getUserInfo: async () => ({
			user: { name: profile.name, email: profile.email, emailVerified: false },
			data: profile,
		}),
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });
	expect(result?.data.user_id).toBe(123);
});
