import { assertType, expect, it } from "vitest";
import type { LinkedInProfile } from "./linkedin";
import { linkedin } from "./linkedin";

/**
 * @see https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
 */
it("accepts a locale language tag from LinkedIn userinfo", async () => {
	const profile = {
		sub: "linkedin-user",
		name: "Jane Doe",
		given_name: "Jane",
		family_name: "Doe",
		picture: "https://example.com/avatar.png",
		locale: "en-US",
	};
	assertType<LinkedInProfile>(profile);
	const provider = linkedin({
		clientId: "linkedin-app",
		getUserInfo: async () => ({
			user: { name: profile.name, emailVerified: false },
			data: profile,
		}),
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });

	expect(result?.data.locale).toBe("en-US");
});
