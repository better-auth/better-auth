import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import type { GoogleProfile } from "../../social-providers";
import { createJWT } from "oslo/jwt";
import { DEFAULT_SECRET } from "../../utils/constants";
import { getOAuth2Tokens } from "../../oauth2";

let email = "";
vi.mock("../../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (...args: any) => {
				const data: GoogleProfile = {
					email,
					email_verified: true,
					name: "First Last",
					picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
					exp: 1234567890,
					sub: "1234567890",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "First",
					family_name: "Last",
				};
				const testIdToken = await createJWT(
					"HS256",
					Buffer.from(DEFAULT_SECRET),
					data,
				);
				const tokens = getOAuth2Tokens({
					access_token: "test",
					refresh_token: "test",
					id_token: testIdToken,
				});
				return tokens;
			}),
	};
});

describe("account", async () => {
	const { auth, client, signInWithTestUser } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
	});

	const { headers } = await signInWithTestUser();
	it("should list all accounts", async () => {
		const accounts = await client.listAccounts({
			fetchOptions: {
				headers,
			},
		});
		expect(accounts.data?.length).toBe(1);
	});

	it("should link account", async () => {
		const linkAccountRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				headers,
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${cookies.get("better-auth.state")?.value}`,
					);
				},
			},
		);
		expect(linkAccountRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(linkAccountRes.data!.url).searchParams.get("state") || "";
		email = "test@test.com";
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			method: "GET",
			headers,
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/callback");
			},
		});
		const { headers: headers2 } = await signInWithTestUser();
		const accounts = await client.listAccounts({
			fetchOptions: { headers: headers2 },
		});
		expect(accounts.data?.length).toBe(2);
	});

	it("shouldn't link existing account", async () => {
		const { headers: headers2 } = await signInWithTestUser();
		const linkAccountRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				headers: headers2,
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${cookies.get("better-auth.state")?.value}`,
					);
				},
			},
		);
		expect(linkAccountRes.error?.status).toBe(400);
	});
});
