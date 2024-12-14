import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { createJWT } from "oslo/jwt";
import { DEFAULT_SECRET } from "../utils/constants";
import type { GoogleProfile } from "./google";
import { parseSetCookieHeader } from "../cookies";
import { getOAuth2Tokens } from "../oauth2";

vi.mock("../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (...args: any) => {
				const data: GoogleProfile = {
					email: "user@email.com",
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

describe("Social Providers", async () => {
	const { auth, customFetchImpl, client, cookieSetter } = await getTestInstance(
		{
			user: {
				additionalFields: {
					firstName: {
						type: "string",
					},
					lastName: {
						type: "string",
					},
					isOAuth: {
						type: "boolean",
					},
				},
			},
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					mapProfileToUser(profile) {
						return {
							firstName: profile.given_name,
							lastName: profile.family_name,
							isOAuth: true,
						};
					},
				},
				apple: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		},
		{
			disableTestUser: true,
		},
	);
	let state = "";

	const headers = new Headers();
	describe("signin", async () => {
		it("should be able to add social providers", async () => {
			const signInRes = await client.signIn.social({
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
			});
			expect(signInRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		});

		it("should be able to sign in with social providers", async () => {
			await client.$fetch("/callback/google", {
				query: {
					state,
					code: "test",
				},
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

		it("should use callback url if the user is already registered", async () => {
			const signInRes = await client.signIn.social({
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
			});
			expect(signInRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

			await client.$fetch("/callback/google", {
				query: {
					state,
					code: "test",
				},
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					expect(location).toContain("/callback");
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
				},
			});
		});
	});

	it("should be able to map profile to user", async () => {
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();

		const profile = await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			method: "GET",
			onError: (c) => {
				//TODO: fix this
				cookieSetter(headers)(c as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user).toMatchObject({
			isOAuth: true,
			firstName: "First",
			lastName: "Last",
		});
	});

	it("should be protected from callback URL attacks", async () => {
		const signInRes = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "https://evil.com/callback",
			},
			{
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

		expect(signInRes.error?.status).toBe(403);
		expect(signInRes.error?.message).toBe("Invalid callbackURL");
	});
});

describe("Redirect URI", async () => {
	it("should infer redirect uri", async () => {
		const { client } = await getTestInstance({
			basePath: "/custom/path",
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});

		await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				onSuccess(context) {
					const redirectURI = context.data.url;
					expect(redirectURI).toContain(
						"http%3A%2F%2Flocalhost%3A3000%2Fcustom%2Fpath%2Fcallback%2Fgoogle",
					);
				},
			},
		);
	});

	it("should respect custom redirect uri", async () => {
		const { auth, customFetchImpl, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					redirectURI: "https://test.com/callback",
				},
			},
		});

		await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				onSuccess(context) {
					const redirectURI = context.data.url;
					expect(redirectURI).toContain(
						"redirect_uri=https%3A%2F%2Ftest.com%2Fcallback",
					);
				},
			},
		);
	});
});
