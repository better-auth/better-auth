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
	{ email: null, display: null, expectedDisplay: undefined },
	{ email: undefined, display: null, expectedDisplay: undefined },
	{ email: null, display: "", expectedDisplay: "" },
])(
	"handles Patreon profiles with email=$email and display=$display",
	async ({ email, display, expectedDisplay }) => {
		server.use(
			http.get("https://www.patreon.com/api/oauth2/v2/identity", () =>
				HttpResponse.json({
					data: {
						id: "patreon-user",
						type: "user",
						attributes: {
							full_name: display,
							email,
							image_url: display,
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
			name: expectedDisplay,
			email,
			image: expectedDisplay,
			emailVerified: false,
		});
	},
);
