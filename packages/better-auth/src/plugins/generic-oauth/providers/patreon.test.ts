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
 * @see https://docs.patreon.com/#2026-05-26-member-identity-masking-implemented
 */
it.each([null, undefined])(
	"normalizes a masked Patreon profile with email=%s",
	async (email) => {
		server.use(
			http.get("https://www.patreon.com/api/oauth2/v2/identity", () =>
				HttpResponse.json({
					data: {
						id: "patreon-user",
						type: "user",
						attributes: {
							full_name: null,
							email,
							image_url: null,
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
			name: undefined,
			email,
			image: undefined,
			emailVerified: false,
		});
	},
);
