import { oauthProvider } from "@better-auth/oauth-provider";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import type { CibaNotification } from "./index";
import { CIBA_GRANT_TYPE, ciba } from "./index";

/**
 * A `baseURL` that already has a path keeps its trailing slash, so joining an
 * endpoint path onto it must not leave `//`.
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-6.2.2.3
 */
describe("baseURL with a trailing slash", async () => {
	const baseURL = "http://localhost:3000/api/auth/";
	const sendNotification = vi.fn((_: CibaNotification) => {});
	const { auth, signInWithTestUser, customFetchImpl, testUser } =
		await getTestInstance({
			baseURL,
			plugins: [
				jwt(),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
				ciba({ resultPage: "/ciba", sendNotification }),
			],
		});
	const { headers } = await signInWithTestUser();

	it("sends an approval link without a double slash", async () => {
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				client_name: "Agent",
				grant_types: [CIBA_GRANT_TYPE],
				metadata: { backchannel_token_delivery_mode: "poll" },
			},
		});
		const res = await customFetchImpl(`${baseURL}oauth2/bc-authorize`, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
			},
			body: new URLSearchParams({
				scope: "openid",
				login_hint: testUser.email,
			}).toString(),
		});
		expect(res.status).toBe(200);
		const url = sendNotification.mock.calls[0]![0].url;
		expect(url).toMatch(
			/^http:\/\/localhost:3000\/api\/auth\/oauth2\/authorize\?/,
		);
	});

	it("advertises a backchannel endpoint without a double slash", async () => {
		const metadata = (await auth.api.getOpenIdConfig()) as Record<
			string,
			unknown
		>;
		expect(metadata.backchannel_authentication_endpoint).toBe(
			"http://localhost:3000/api/auth/oauth2/bc-authorize",
		);
	});
});
