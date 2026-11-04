import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, expect, it } from "vitest";
import { gumroad } from "./gumroad";

const server = setupServer(
	http.get("https://api.gumroad.com/v2/user", () =>
		HttpResponse.json({
			success: true,
			user: {
				user_id: "gumroad-user",
				name: null,
				email: "user@example.com",
				profile_url: "https://example.com/avatar.png",
			},
		}),
	),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

/**
 * @see https://github.com/antiwork/gumroad/blob/23e9dbef16a7620f2853f8f823c89c3381f1e191/app/models/concerns/user/as_json.rb#L6-L15
 * @see https://github.com/antiwork/gumroad/blob/23e9dbef16a7620f2853f8f823c89c3381f1e191/spec/models/user_spec.rb#L1638-L1642
 */
it("normalizes a Gumroad profile without a name", async () => {
	const config = gumroad({
		clientId: "gumroad-app",
		clientSecret: "gumroad-secret",
	});

	const profile = await config.getUserInfo?.({ accessToken: "access-token" });

	expect(profile).toEqual({
		id: "gumroad-user",
		name: undefined,
		email: "user@example.com",
		image: "https://example.com/avatar.png",
		emailVerified: false,
	});
});
