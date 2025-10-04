import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";
import { parseCookies, parseSetCookieHeader } from "../../cookies";
import { DEFAULT_SECRET } from "../../utils/constants";
import type { GoogleProfile } from "../../social-providers/google";
import { getOAuth2Tokens } from "../../oauth2";
import { signJWT } from "../../crypto/jwt";

// Mock OAuth2 functions to return valid tokens for testing
vi.mock("../../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (option: any) => {
				const data: GoogleProfile = {
					email: "github-issue-demo@example.com",
					email_verified: true,
					name: "OAuth Test User",
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
					given_name: "OAuth",
					family_name: "Test",
				};
				const testIdToken = await signJWT(data, DEFAULT_SECRET);
				const tokens = getOAuth2Tokens({
					access_token: "test-access-token",
					refresh_token: "test-refresh-token",
					id_token: testIdToken,
				});
				return tokens;
			}),
	};
});

describe("lastLoginMethod", async () => {
	const { client, cookieSetter, testUser } = await getTestInstance(
		{
			plugins: [lastLoginMethod()],
		},
		{
			clientOptions: {
				plugins: [lastLoginMethodClient()],
			},
		},
	);

	it("should set the last login method cookie", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should set the last login method in the database", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});
		const data = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ throw: true },
		);
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${data.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("email");
	});

	it("should NOT set the last login method cookie on failed authentication", async () => {
		const headers = new Headers();
		const response = await client.signIn.email(
			{
				email: testUser.email,
				password: "wrong-password",
			},
			{
				onError(context) {
					cookieSetter(headers)(context);
				},
			},
		);

		expect(response.error).toBeDefined();

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
	});

	it("should NOT set the last login method cookie on failed OAuth callback", async () => {
		const headers = new Headers();
		const response = await client.$fetch("/callback/google", {
			method: "GET",
			query: {
				code: "invalid-code",
				state: "invalid-state",
			},
			onError(context) {
				cookieSetter(headers)(context);
			},
		});

		expect(response.error).toBeDefined();

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
	});
	it("should update the last login method in the database on subsequent logins", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});

		await client.signUp.email(
			{
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			},
			{ throw: true },
		);

		const emailSignInData = await client.signIn.email(
			{
				email: "test@example.com",
				password: "password123",
			},
			{ throw: true },
		);

		let session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData.token}`,
			}),
		});
		expect((session?.user as any).lastLoginMethod).toBe("email");

		await client.signOut();

		const emailSignInData2 = await client.signIn.email(
			{
				email: "test@example.com",
				password: "password123",
			},
			{ throw: true },
		);

		session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData2.token}`,
			}),
		});

		expect((session?.user as any).lastLoginMethod).toBe("email");
	});

	it("should update the last login method in the database on subsequent logins with email and OAuth", async () => {
		const { client, auth, cookieSetter } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
			account: {
				accountLinking: {
					enabled: true,
					trustedProviders: ["google"],
				},
			},
		});

		await client.signUp.email(
			{
				email: "github-issue-demo@example.com",
				password: "password123",
				name: "GitHub Issue Demo User",
			},
			{ throw: true },
		);

		const emailSignInData = await client.signIn.email(
			{
				email: "github-issue-demo@example.com",
				password: "password123",
			},
			{ throw: true },
		);

		let session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData.token}`,
			}),
		});

		expect((session?.user as any).lastLoginMethod).toBe("email");

		await client.signOut();

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers: oAuthHeaders,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();

				cookieSetter(headers)(context as any);

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const lastLoginMethod = cookies.get(
					"better-auth.last_used_login_method",
				)?.value;
				if (lastLoginMethod) {
					expect(lastLoginMethod).toBe("google");
				}
			},
		});

		const oauthSession = await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		expect((oauthSession?.data?.user as any).lastLoginMethod).toBe("google");
	});
});
