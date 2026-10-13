import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { twoFactor, twoFactorClient } from "../../plugins/two-factor";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";

describe("session_data regeneration after expiry", async () => {
	it("should regenerate session_data cookie when it expires but session_token is still valid", async () => {
		const { client, testUser } = await getTestInstance({
			session: {
				expiresIn: 60 * 60 * 24 * 7, // 7 days
				updateAge: 60 * 60 * 24, // 1 day
				cookieCache: {
					enabled: true,
					maxAge: 5, // 5 seconds for testing (simulating a short expiry)
				},
			},
		});

		const headers = new Headers();

		// Sign in - this should set both session_token and session_data
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log("Sign-in cookies:", setCookie);
					const parsed = parseSetCookieHeader(setCookie!);
					expect(parsed.get("better-auth.session_data")).toBeDefined();
					expect(parsed.get("better-auth.session_token")).toBeDefined();

					// Store only session_token (simulating session_data expiry)
					const sessionToken = parsed.get("better-auth.session_token");
					headers.set(
						"cookie",
						`better-auth.session_token=${sessionToken?.value}`,
					);
				},
			},
		);

		// Now make a getSession call WITHOUT session_data cookie
		// This simulates the case where session_data has expired but session_token is still valid
		let sessionDataRegenerated = false;
		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log("GetSession cookies:", setCookie);
					if (setCookie) {
						const parsed = parseSetCookieHeader(setCookie);
						if (parsed.get("better-auth.session_data")?.value) {
							sessionDataRegenerated = true;
						}
					}
				},
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
		expect(sessionDataRegenerated).toBe(true); // This is the key assertion
	});

	it("should regenerate session_data when dontRememberMe is true", async () => {
		const { client, testUser } = await getTestInstance({
			session: {
				expiresIn: 60 * 60 * 24 * 7, // 7 days
				updateAge: 60 * 60 * 24, // 1 day
				cookieCache: {
					enabled: true,
					maxAge: 60 * 5, // 5 minutes
				},
			},
		});

		const headers = new Headers();

		// Sign in with rememberMe: false
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					const parsed = parseSetCookieHeader(setCookie!);

					// With rememberMe: false, max-age should be undefined (session cookie)
					expect(
						parsed.get("better-auth.session_token")?.["max-age"],
					).toBeUndefined();
					expect(
						parsed.get("better-auth.session_data")?.["max-age"],
					).toBeUndefined();

					// Store only session_token and dont_remember cookie (simulating session_data expiry)
					const sessionToken = parsed.get("better-auth.session_token");
					const dontRemember = parsed.get("better-auth.dont_remember");
					headers.set(
						"cookie",
						`better-auth.session_token=${sessionToken?.value}; better-auth.dont_remember=${dontRemember?.value}`,
					);
				},
			},
		);

		// Now make a getSession call WITHOUT session_data cookie
		let sessionDataRegenerated = false;
		const session = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					console.log("GetSession (dontRememberMe) cookies:", setCookie);
					if (setCookie) {
						const parsed = parseSetCookieHeader(setCookie);
						if (parsed.get("better-auth.session_data")?.value) {
							sessionDataRegenerated = true;
						}
					}
				},
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(testUser.email);
		// BUG: session_data is NOT regenerated when dontRememberMe is true!
		// This assertion will fail if there's a bug
		expect(sessionDataRegenerated).toBe(true);
	});
});

describe("twoFactor with cookieCache disabled", async () => {
	it("should work correctly when cookieCache is disabled", async () => {
		const { testUser, customFetchImpl, sessionSetter, db } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				// cookieCache is NOT enabled - this is the key difference
				plugins: [
					twoFactor({
						skipVerificationOnEnable: true,
					}),
				],
			});

		const headers = new Headers();

		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});

		// Sign in first to get a session
		const signInResult = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		const userId = signInResult.data?.user?.id;
		expect(userId).toBeDefined();

		// Enable 2FA
		const enableRes = await client.twoFactor.enable({
			password: testUser.password,
			fetchOptions: {
				headers,
				onSuccess: sessionSetter(headers),
			},
		});
		expect(enableRes.data?.totpURI).toBeDefined();

		// Get the TOTP secret from the database
		const twoFactorRecord = await db.findOne({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		expect(twoFactorRecord).toBeDefined();

		const decryptedSecret = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: twoFactorRecord!.secret as string,
		});

		// Now sign in again to trigger 2FA
		const signInHeaders = new Headers();
		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onResponse(context) {
					const setCookie = context.response.headers.get("Set-Cookie");
					console.log("Sign-in with 2FA cookies:", setCookie);
					const parsed = parseSetCookieHeader(setCookie || "");
					// Should have two_factor cookie set
					const twoFactorCookie = parsed.get("better-auth.two_factor");
					expect(twoFactorCookie?.value).toBeDefined();
					signInHeaders.append(
						"cookie",
						`better-auth.two_factor=${twoFactorCookie?.value}`,
					);
				},
			},
		});

		// Should redirect to 2FA
		expect(
			(signInRes.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect,
		).toBe(true);

		// Generate TOTP code
		const code = await createOTP(decryptedSecret).totp();

		// Verify TOTP - this should work even without cookieCache
		const verifyRes = await client.twoFactor.verifyTotp({
			code,
			fetchOptions: {
				headers: signInHeaders,
				onResponse(context) {
					const setCookie = context.response.headers.get("Set-Cookie");
					console.log("TOTP verify cookies:", setCookie);
				},
			},
		});

		// This should succeed - TOTP verification works even without cookieCache
		expect(verifyRes.error).toBeFalsy();
		expect(verifyRes.data?.token).toBeDefined();
	});
});
