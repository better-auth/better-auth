import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { patreon } from "./patreon";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * @see https://docs.patreon.com/#user-v2
 * @see https://docs.patreon.com/#code-2026-05-26-code-member-identity-masking-implemented
 */
it.each([
	{
		email: null,
		fullName: null,
		imageUrl: "https://example.com/avatar.png",
		name: undefined,
		image: "https://example.com/avatar.png",
	},
	{
		email: undefined,
		fullName: "Patreon User",
		imageUrl: null,
		name: "Patreon User",
		image: undefined,
	},
	{ email: null, fullName: "", imageUrl: "", name: "", image: "" },
])(
	"handles Patreon profiles with name=$fullName and image=$imageUrl",
	async ({ email, fullName, imageUrl, name, image }) => {
		server.use(
			http.get("https://www.patreon.com/api/oauth2/v2/identity", () =>
				HttpResponse.json({
					data: {
						id: "patreon-user",
						type: "user",
						attributes: {
							full_name: fullName,
							email,
							image_url: imageUrl,
							is_email_verified: false,
						},
					},
				}),
			),
		);
		const config = patreon({
			clientId: "patreon-app",
			clientSecret: "patreon-secret",
			scopes: email === undefined ? ["identity"] : ["identity[email]"],
		});

		const profile = await config.getUserInfo?.({ accessToken: "access-token" });

		expect(profile).toEqual({
			id: "patreon-user",
			name,
			email,
			image,
			emailVerified: false,
		});
	},
);
