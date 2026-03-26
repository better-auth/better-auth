import type { ZohoProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../cookies";
import { signJWT } from "../crypto";
import { getTestInstance } from "../test-utils/test-instance";
import { DEFAULT_SECRET } from "../utils/constants";

const zohoProfile: ZohoProfile = {
	sub: "733180192.942669522",
	name: "Ruban S",
	first_name: "Ruban",
	last_name: "S",
	email: "ruban@example.com",
	email_verified: true,
	picture: "https://contacts.zoho.in/file?t=user&ID=733180192",
};

const mswServer = setupServer();

beforeAll(() => {
	mswServer.listen({ onUnhandledRequest: "bypass" });
	mswServer.use(
		http.post("https://accounts.zoho.in/oauth/v2/token", async () => {
			const testIdToken = await signJWT(
				{
					...zohoProfile,
					iss: "accounts.zoho.in",
					aud: "test",
					iat: Math.floor(Date.now() / 1000),
					exp: Math.floor(Date.now() / 1000) + 3600,
				},
				DEFAULT_SECRET,
			);
			return HttpResponse.json({
				access_token: "test-access-token",
				id_token: testIdToken,
				token_type: "Bearer",
				expires_in: 3600,
			});
		}),
	);
});

afterAll(() => mswServer.close());

describe("Zoho Provider", async () => {
	const { client, cookieSetter } = await getTestInstance(
		{
			socialProviders: {
				zoho: {
					clientId: "test",
					clientSecret: "test",
					accountsServer: "https://accounts.zoho.in",
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should redirect to Zoho authorization URL", async () => {
		const res = await client.signIn.social({
			provider: "zoho",
			callbackURL: "/callback",
		});

		expect(res.data).not.toBeNull();
		const url = res.data?.url;
		expect(url).toBeDefined();
		expect(url).toContain("accounts.zoho.in/oauth/v2/auth");
		expect(url).toContain("scope=openid+email+profile");
		expect(url).toContain("client_id=test");
	});

	it("should sign in with Zoho and create user", async () => {
		const headers = new Headers();

		const signInRes = await client.signIn.social({
			provider: "zoho",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/zoho", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/welcome");
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
			},
		});
	});
});
