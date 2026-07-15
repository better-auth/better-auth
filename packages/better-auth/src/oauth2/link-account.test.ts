import { DatabaseSync } from "node:sqlite";
import type {
	DiscordProfile,
	GoogleProfile,
} from "@better-auth/core/social-providers";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { Kysely } from "kysely";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import * as z from "zod";
import { betterAuth } from "../auth/full";
import { createAuthClient } from "../client";
import { parseSetCookieHeader, setCookieToHeader } from "../cookies";
import { signJWT } from "../crypto";
import { getMigrations } from "../db/get-migration";
import { getTestInstance } from "../test-utils/test-instance";
import type { User } from "../types";
import { DEFAULT_SECRET } from "../utils/constants";

let mockEmail = "";
let mockEmailVerified = true;

const server = setupServer();

beforeAll(() => {
	server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
	server.resetHandlers();
});

afterAll(() => server.close());

describe("oauth2 - email verification on link", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
			},
		},
	});

	const ctx = await auth.$context;

	async function linkGoogleAccount(): Promise<{ redirectLocation: string }> {
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: mockEmail,
					email_verified: mockEmailVerified,
					name: "Test User",
					picture: "https://example.com/photo.jpg",
					exp: 1234567890,
					sub: "google_oauth_sub_1234567890",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Test",
					family_name: "User",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				redirectLocation = context.response.headers.get("location") || "";
			},
		});
		return { redirectLocation };
	}

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7
	 */
	it("should reject implicit link when local user is unverified, even if provider email is verified", async () => {
		const testEmail = "unverified-local@example.com";

		// Create user with unverified email
		mockEmail = testEmail;
		mockEmailVerified = false;

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Initial state: local row is unverified
		let user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(false);

		// Attempt to link with Google account that has verified email
		mockEmailVerified = true;
		const { redirectLocation } = await linkGoogleAccount();

		// Callback redirects with the documented account_not_linked error code so
		// the test can't pass on an unrelated redirect (e.g. server-side failure).
		expect(redirectLocation).toContain("error=account_not_linked");

		// Link is rejected: no Google account row, local emailVerified untouched
		const accounts = await ctx.adapter.findMany<{
			providerId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeUndefined();

		user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(false);
	});

	it("should link account and preserve emailVerified when local user is already verified", async () => {
		const testEmail = "verified-local@example.com";

		mockEmail = testEmail;
		mockEmailVerified = true;

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Pre-verify the local user (e.g. via email-otp or verification token)
		await ctx.adapter.update({
			model: "user",
			where: [{ field: "id", value: userId }],
			update: { emailVerified: true },
		});

		await linkGoogleAccount();

		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(true);

		const accounts = await ctx.adapter.findMany<{
			providerId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});
		expect(accounts.find((a) => a.providerId === "google")).toBeDefined();
	});

	it("should not update emailVerified when provider reports unverified", async () => {
		const testEmail = "unverified@example.com";

		// Create user with unverified email
		mockEmail = testEmail;
		mockEmailVerified = false;

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Unverified User",
		});

		const userId = signUpRes.data!.user.id;

		// Link Google account with unverified email from provider
		await linkGoogleAccount();

		// Verify email remains unverified
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(false);
	});

	it("should not update emailVerified when email addresses don't match", async () => {
		const userEmail = "user@example.com";
		const googleEmail = "different@gmail.com";

		// Create user with one email
		mockEmail = userEmail;
		mockEmailVerified = false;

		const signUpRes = await client.signUp.email({
			email: userEmail,
			password: "password123",
			name: "Test User",
		});

		const userId = signUpRes.data!.user.id;

		// Verify initial state
		let user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(false);

		// Try to link with Google using different email (verified)
		mockEmail = googleEmail;
		mockEmailVerified = true;
		await linkGoogleAccount();

		// Verify emailVerified remains false (emails don't match)
		user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(false);
	});

	it("should handle already verified emails gracefully", async () => {
		const testEmail = "already-verified@example.com";

		// Create user with verified email
		mockEmail = testEmail;
		mockEmailVerified = true;

		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Verified User",
		});

		const userId = signUpRes.data!.user.id;

		// Manually set emailVerified to true
		await ctx.adapter.update({
			model: "user",
			where: [{ field: "id", value: userId }],
			update: { emailVerified: true },
		});

		// Link with Google account (also verified)
		await linkGoogleAccount();

		// Verify email remains verified
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(true);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/7806
 */
describe("oauth2 - account linking with case insensitive email", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
				verifyIdToken: async () => true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
			},
		},
	});

	const ctx = await auth.$context;

	it("should link account when email casing differs using callback", async () => {
		const testEmail = "casing-test@example.com";
		const googleEmail = "Casing-Test@Example.com";

		// Create user with lowercase email
		const sessionHeaders = new Headers();
		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Test User",
			fetchOptions: {
				onSuccess: cookieSetter(sessionHeaders),
			},
		});

		expect(signUpRes.data).toBeTruthy();
		const userId = signUpRes.data!.user.id;

		// Link with Google account that has different casing
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: googleEmail,
					email_verified: true,
					name: "Test User",
					picture: "https://example.com/photo.jpg",
					exp: 1234567890,
					sub: "google_oauth_sub_casing",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Test",
					family_name: "User",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const linkRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/settings",
			},
			{
				headers: sessionHeaders,
				onSuccess: cookieSetter(sessionHeaders),
			},
		);

		expect(linkRes.error).toBeNull();
		expect(linkRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state = new URL(linkRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: sessionHeaders,
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("/settings");

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});

		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeTruthy();
	});

	it("should link account when email casing differs using idToken", async () => {
		const testEmail = "casing-test2@example.com";
		const googleEmail = "Casing-Test2@Example.com";

		// Create user with lowercase email
		const sessionHeaders = new Headers();
		const signUpRes = await client.signUp.email({
			email: testEmail,
			password: "password123",
			name: "Test User",
			fetchOptions: {
				onSuccess: cookieSetter(sessionHeaders),
			},
		});

		expect(signUpRes.data).toBeTruthy();
		const userId = signUpRes.data!.user.id;

		const profile: GoogleProfile = {
			email: googleEmail,
			email_verified: true,
			name: "Test User",
			picture: "https://example.com/photo.jpg",
			exp: 1234567890,
			sub: "google_oauth_sub_casing_id_token",
			iat: 1234567890,
			aud: "test",
			azp: "test",
			nbf: 1234567890,
			iss: "test",
			locale: "en",
			jti: "test",
			given_name: "Test",
			family_name: "User",
		};
		const idToken = await signJWT(profile, DEFAULT_SECRET);

		const linkRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/settings",
				idToken: { token: idToken },
			},
			{
				headers: sessionHeaders,
				onSuccess: cookieSetter(sessionHeaders),
			},
		);

		expect(linkRes.error).toBeNull();
		expect(linkRes.data).toBeTruthy();

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});

		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeTruthy();
	});
});

describe("oauth2 - account linking without trustedProviders", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: [],
			},
		},
	});

	const ctx = await auth.$context;

	it("should deny account linking when provider is not trusted and email is not verified", async () => {
		const testEmail = "untrusted@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				id: "existing-user-id",
				email: testEmail,
				name: "Existing User",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					email: testEmail,
					email_verified: false,
					name: "Test User",
					sub: "google_untrusted_123",
					iat: 1234567890,
					exp: 1234567890,
					aud: "test",
					iss: "test",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		expect(redirectLocation).toContain("error=account_not_linked");

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: "existing-user-id" }],
		});
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeUndefined();
	});

	it("should allow account linking when email is verified by provider and local user", async () => {
		const testEmail = "verified-provider@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				id: "existing-user-verified",
				email: testEmail,
				name: "Existing User",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					email: testEmail,
					email_verified: true,
					name: "Test User",
					sub: "google_verified_456",
					iat: 1234567890,
					exp: 1234567890,
					aud: "test",
					iss: "test",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		expect(redirectLocation).not.toContain("error=account_not_linked");

		const user = await ctx.adapter.findOne<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: testEmail }],
		});
		expect(user).toBeTruthy();

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: user!.id }],
		});
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeTruthy();
	});
});

describe("oauth2 - disableImplicitLinking", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				disableImplicitLinking: true,
				trustedProviders: ["google"],
			},
		},
	});

	const ctx = await auth.$context;

	it("should block implicit linking on sign-in even for trusted providers", async () => {
		const testEmail = "implicit-block@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				id: "implicit-block-user",
				email: testEmail,
				name: "Existing User",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					email: testEmail,
					email_verified: true,
					name: "Test User",
					sub: "google_implicit_block_123",
					iat: 1234567890,
					exp: 1234567890,
					aud: "test",
					iss: "test",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		expect(redirectLocation).toContain("error=account_not_linked");

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: "implicit-block-user" }],
		});
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeUndefined();
	});

	it("should allow new user sign-up even with disableImplicitLinking", async () => {
		const newUserEmail = "new-user-implicit@example.com";

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					email: newUserEmail,
					email_verified: true,
					name: "New User",
					sub: "google_new_user_implicit_456",
					iat: 1234567890,
					exp: 1234567890,
					aud: "test",
					iss: "test",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		expect(redirectLocation).not.toContain("error");

		const user = await ctx.adapter.findOne<{ id: string }>({
			model: "user",
			where: [{ field: "email", value: newUserEmail }],
		});
		expect(user).toBeTruthy();
	});

	it("should allow explicit linkSocial when disableImplicitLinking is true", async () => {
		const testEmail = "explicit-link@example.com";

		const sessionHeaders = new Headers();
		const signUpRes = await client.signUp.email(
			{
				email: testEmail,
				password: "password123",
				name: "Test User",
			},
			{
				onSuccess: cookieSetter(sessionHeaders),
			},
		);

		expect(signUpRes.data).toBeTruthy();
		const userId = signUpRes.data!.user.id;

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					email: testEmail,
					email_verified: true,
					name: "Test User",
					sub: "google_explicit_link_789",
					iat: 1234567890,
					exp: 1234567890,
					aud: "test",
					iss: "test",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const linkRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/settings",
			},
			{
				headers: sessionHeaders,
				onSuccess: cookieSetter(sessionHeaders),
			},
		);

		expect(linkRes.error).toBeNull();
		expect(linkRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state = new URL(linkRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: sessionHeaders,
			onError(context) {
				redirectLocation = context.response.headers.get("location") || "";
			},
		});

		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("/settings");

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeTruthy();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8742
 */
describe("oauth2 - updateUserInfoOnLink via callback", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
				updateUserInfoOnLink: true,
			},
		},
	});

	const ctx = await auth.$context;

	it("should update user name and image when linking via OAuth callback", async () => {
		const testEmail = "update-on-link@example.com";

		const sessionHeaders = new Headers();
		const signUpRes = await client.signUp.email(
			{
				email: testEmail,
				password: "password123",
				name: "Original Name",
			},
			{
				onSuccess: cookieSetter(sessionHeaders),
			},
		);

		expect(signUpRes.data).toBeTruthy();
		const userId = signUpRes.data!.user.id;

		// Verify initial state - no image, original name
		let user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.name).toBe("Original Name");
		expect(user?.image).toBeNull();

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: testEmail,
					email_verified: true,
					name: "Updated Name From Google",
					picture: "https://example.com/avatar.jpg",
					exp: 1234567890,
					sub: "google_update_on_link_123",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Updated",
					family_name: "Name From Google",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const linkRes = await client.linkSocial(
			{
				provider: "google",
				callbackURL: "/settings",
			},
			{
				headers: sessionHeaders,
				onSuccess: cookieSetter(sessionHeaders),
			},
		);

		expect(linkRes.error).toBeNull();

		const state = new URL(linkRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: sessionHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
			},
		});

		// Verify user info was updated
		user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.name).toBe("Updated Name From Google");
		expect(user?.image).toBe("https://example.com/avatar.jpg");
	});

	it("should not update user info when updateUserInfoOnLink is not set", async () => {
		const {
			client: client2,
			auth: auth2,
			cookieSetter: cookieSetter2,
		} = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			emailAndPassword: {
				enabled: true,
			},
			account: {
				accountLinking: {
					enabled: true,
					trustedProviders: ["google"],
				},
			},
		});

		const ctx2 = await auth2.$context;
		const testEmail = "no-update-on-link@example.com";

		const sessionHeaders = new Headers();
		const signUpRes = await client2.signUp.email(
			{
				email: testEmail,
				password: "password123",
				name: "Should Not Change",
			},
			{
				onSuccess: cookieSetter2(sessionHeaders),
			},
		);

		expect(signUpRes.data).toBeTruthy();
		const userId = signUpRes.data!.user.id;

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: testEmail,
					email_verified: true,
					name: "Google Name",
					picture: "https://example.com/photo.jpg",
					exp: 1234567890,
					sub: "google_no_update_456",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Google",
					family_name: "Name",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const linkRes = await client2.linkSocial(
			{
				provider: "google",
				callbackURL: "/settings",
			},
			{
				headers: sessionHeaders,
				onSuccess: cookieSetter2(sessionHeaders),
			},
		);

		expect(linkRes.error).toBeNull();

		const state = new URL(linkRes.data!.url!).searchParams.get("state") || "";
		await client2.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: sessionHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
			},
		});

		// Verify user info was NOT updated
		const user = await ctx2.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.name).toBe("Should Not Change");
		expect(user?.image).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8742
 *
 * Implicit linking (an existing user signs in with a social provider whose
 * email matches) updated the user row but returned the pre-update user, so the
 * freshly issued session and its cookie cache served the stale name/image until
 * the cache expired. These assert the returned session reflects the update, and
 * that the synced field set is the full mapped profile, not just name/image.
 */
describe("oauth2 - updateUserInfoOnLink on implicit sign-in link", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		user: {
			additionalFields: {
				googleSub: { type: "string", required: false },
				profileCode: {
					type: "string",
					required: false,
					transform: {
						input(value) {
							return typeof value === "string" ? value.toLowerCase() : value;
						},
					},
				},
				validatedProfileCode: {
					type: "string",
					required: false,
					validator: {
						input: z.string().min(3),
					},
				},
				serverManagedField: {
					type: "string",
					required: false,
					input: false,
				},
			},
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
				mapProfileToUser(profile: GoogleProfile) {
					return {
						googleSub: profile.sub,
						profileCode: profile.sub,
						validatedProfileCode: profile.sub,
						serverManagedField: "elevated",
					};
				},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
				updateUserInfoOnLink: true,
			},
		},
		session: {
			cookieCache: { enabled: true, maxAge: 300 },
		},
	});

	const ctx = await auth.$context;

	async function signInAndLink(email: string, sub: string) {
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					sub,
					email,
					email_verified: true,
					name: "Updated Name From Google",
					picture: "https://example.com/avatar.jpg",
				} as GoogleProfile;
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: { onSuccess: cookieSetter(oAuthHeaders) },
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(oAuthHeaders)(context as any);
			},
		});
		return oAuthHeaders;
	}

	it("returns the freshly linked name and image in the new session", async () => {
		const testEmail = "implicit-link@example.com";
		await ctx.adapter.create({
			model: "user",
			data: { email: testEmail, name: "Original Name", emailVerified: true },
		});

		const oAuthHeaders = await signInAndLink(testEmail, "google_implicit_name");

		// The cookie cache is seeded from the value handleOAuthUserInfo returns,
		// and getSession serves it without a database read, so a stale return
		// would surface right here.
		const session = await client.getSession({
			fetchOptions: { headers: oAuthHeaders },
		});
		expect(session.data?.user.name).toBe("Updated Name From Google");
		expect(session.data?.user.image).toBe("https://example.com/avatar.jpg");
	});

	it("syncs mapProfileToUser fields on link, not only name and image", async () => {
		const testEmail = "implicit-link-mapped@example.com";
		await ctx.adapter.create({
			model: "user",
			data: { email: testEmail, name: "Original Name", emailVerified: true },
		});

		const updateUserSpy = vi.spyOn(ctx.internalAdapter, "updateUser");
		try {
			await signInAndLink(testEmail, "GOOGLE_IMPLICIT_MAPPED");

			expect(updateUserSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					googleSub: "GOOGLE_IMPLICIT_MAPPED",
					profileCode: "google_implicit_mapped",
				}),
			);

			const user = await ctx.adapter.findOne<
				User & { googleSub?: string; profileCode?: string }
			>({
				model: "user",
				where: [{ field: "email", value: testEmail }],
			});
			expect(user?.googleSub).toBe("GOOGLE_IMPLICIT_MAPPED");
			expect(user?.profileCode).toBe("google_implicit_mapped");
		} finally {
			updateUserSpy.mockRestore();
		}
	});

	it("does not copy fields marked input: false from the provider on link", async () => {
		const testEmail = "implicit-link-input-false@example.com";
		await ctx.adapter.create({
			model: "user",
			data: { email: testEmail, name: "Original Name", emailVerified: true },
		});

		await signInAndLink(testEmail, "google_link_input_false");

		const user = await ctx.adapter.findOne<
			User & { googleSub?: string; serverManagedField?: string | null }
		>({
			model: "user",
			where: [{ field: "email", value: testEmail }],
		});
		expect(user?.googleSub).toBe("google_link_input_false");
		expect(user?.serverManagedField ?? null).toBeNull();
	});

	it("continues linking when mapped profile fields fail validation", async () => {
		const testEmail = "implicit-link-invalid-profile@example.com";
		await ctx.adapter.create({
			model: "user",
			data: { email: testEmail, name: "Original Name", emailVerified: true },
		});

		const oAuthHeaders = await signInAndLink(testEmail, "x");

		const session = await client.getSession({
			fetchOptions: { headers: oAuthHeaders },
		});
		expect(session.data?.user.email).toBe(testEmail);
		expect(session.data?.user.name).toBe("Original Name");

		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [{ field: "userId", value: session.data!.user.id }],
		});
		expect(accounts.find((a) => a.providerId === "google")).toBeTruthy();

		const user = await ctx.adapter.findOne<
			User & { validatedProfileCode?: string | null }
		>({
			model: "user",
			where: [{ field: "email", value: testEmail }],
		});
		expect(user?.validatedProfileCode ?? null).toBeNull();
	});
});

describe("oauth2 - first sign-in provisioning applies user input rules", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		user: {
			additionalFields: {
				googleSub: { type: "string", required: false },
				profileCode: {
					type: "string",
					required: false,
					transform: {
						input(value) {
							return typeof value === "string" ? value.toLowerCase() : value;
						},
					},
				},
				serverManagedField: {
					type: "string",
					required: false,
					input: false,
				},
				serverManagedDefault: {
					type: "string",
					required: false,
					defaultValue: "member",
					input: false,
				},
			},
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
				mapProfileToUser(profile: GoogleProfile) {
					return {
						googleSub: profile.sub,
						profileCode: "PROVIDER-CODE",
						serverManagedField: "elevated",
						serverManagedDefault: "admin",
					};
				},
			},
		},
	});

	const ctx = await auth.$context;

	it("does not copy fields marked input: false from the provider on first sign-in", async () => {
		const testEmail = "implicit-create-input-false@example.com";

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					sub: "google_create_input_false",
					email: testEmail,
					email_verified: true,
					name: "Created From Google",
				} as GoogleProfile;
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: { onSuccess: cookieSetter(oAuthHeaders) },
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(oAuthHeaders)(context as any);
			},
		});

		const user = await ctx.adapter.findOne<
			User & {
				googleSub?: string;
				profileCode?: string;
				serverManagedField?: string | null;
				serverManagedDefault?: string | null;
			}
		>({
			model: "user",
			where: [{ field: "email", value: testEmail }],
		});
		// The mapped, input-enabled field is still written...
		expect(user?.googleSub).toBe("google_create_input_false");
		expect(user?.profileCode).toBe("provider-code");
		// ...while the input: false provider value is ignored.
		expect(user?.serverManagedField ?? null).toBeNull();
		// The schema-owned default still applies on create.
		expect(user?.serverManagedDefault).toBe("member");
	});
});

describe("oauth2 - override user info on sign-in", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		user: {
			additionalFields: {
				serverManagedField: {
					type: "string",
					required: false,
					input: false,
				},
			},
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
				overrideUserInfoOnSignIn: true,
				mapProfileToUser() {
					return { serverManagedField: "elevated" };
				},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
			},
		},
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 300,
			},
		},
	});

	const ctx = await auth.$context;

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should update user info when overrideUserInfo is enabled", async () => {
		const testEmail = "override@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				email: testEmail,
				name: "Initial Name",
				emailVerified: true,
			},
		});

		// Simulate DB latency
		const originalUpdateUser = ctx.internalAdapter.updateUser.bind(
			ctx.internalAdapter,
		);
		vi.spyOn(ctx.internalAdapter, "updateUser").mockImplementation(
			async (id, data) => {
				const result = await originalUpdateUser(id, data);
				await new Promise((resolve) => setTimeout(resolve, 100));
				return result;
			},
		);

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					sub: "google_123",
					email: testEmail,
					email_verified: true,
					name: "Updated Name",
				} as GoogleProfile;
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(oAuthHeaders)(context as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers: oAuthHeaders,
			},
		});

		expect(session.data?.user.name).toBe("Updated Name");
	});

	it("should preserve the resolved user when overrideUserInfo update returns null", async () => {
		const testEmail = "override-null@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				email: testEmail,
				name: "Initial Name",
				emailVerified: true,
			},
		});

		const originalUpdate = ctx.adapter.update.bind(ctx.adapter);
		vi.spyOn(ctx.adapter, "update").mockImplementation(async (payload) => {
			const result = await originalUpdate(payload);
			return payload.model === "user" ? null : result;
		});

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					sub: "google_null_update",
					email: testEmail,
					email_verified: true,
					name: "Updated Name",
				} as GoogleProfile;
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(oAuthHeaders)(context as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers: oAuthHeaders,
			},
		});

		expect(session.data?.user.email).toBe(testEmail);
	});

	it("does not copy fields marked input: false from the provider when overriding", async () => {
		const testEmail = "override-input-false@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				email: testEmail,
				name: "Initial Name",
				emailVerified: true,
			},
		});

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					sub: "google_override_input_false",
					email: testEmail,
					email_verified: true,
					name: "Updated Name",
				} as GoogleProfile;
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(oAuthHeaders)(context as any);
			},
		});

		const user = await ctx.adapter.findOne<
			User & { serverManagedField?: string | null }
		>({
			model: "user",
			where: [{ field: "email", value: testEmail }],
		});
		// overrideUserInfo still applied the provider's name...
		expect(user?.name).toBe("Updated Name");
		// ...but the input: false field was ignored.
		expect(user?.serverManagedField ?? null).toBeNull();
	});
});

describe("oauth2 - sign-up account creation rollback", async () => {
	const sqlite = new DatabaseSync(":memory:");
	const database = new Kysely({
		dialect: new NodeSqliteDialect({ database: sqlite }),
	});
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: {
			db: database,
			type: "sqlite",
			transaction: true,
		},
		account: {
			additionalFields: {
				requiredAccountField: {
					type: "string",
					required: true,
				},
			},
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		rateLimit: {
			enabled: false,
		},
	});
	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();

	const client = createAuthClient({
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: (url, init) => auth.handler(new Request(url, init)),
		},
	});

	const ctx = await auth.$context;

	afterAll(async () => {
		await database.destroy();
	});

	it("rolls back the user row when the first OAuth account cannot be created", async () => {
		const testEmail = "oauth-rollback@example.com";

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					sub: "google_rollback",
					email: testEmail,
					email_verified: true,
					name: "Rollback User",
				} as GoogleProfile;
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_token",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: {
				onSuccess: setCookieToHeader(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				redirectLocation = context.response.headers.get("location") || "";
				setCookieToHeader(oAuthHeaders)(context);
			},
		});

		expect(redirectLocation).toContain("error=unable_to_create_user");

		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: testEmail }],
		});
		expect(user).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8906
 *
 * Regression: linkSocial callback looked up the provider subject without its
 * issuer namespace. When two different issuers share the same numeric subject,
 * the wrong account could be matched, causing a
 * spurious "account_already_linked_to_different_user" error or silently
 * updating the wrong account record.
 */
describe("oauth2 - link-social uses issuer-scoped account lookup", async () => {
	// Shared numeric ID used by both Google and GitHub to trigger the bug
	const SHARED_ACCOUNT_ID = "99999";

	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
			github: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google", "github"],
			},
		},
	});

	const ctx = await auth.$context;

	function mockGoogleToken(email: string, sub: string) {
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile = {
					sub,
					email,
					email_verified: true,
					name: "Test User",
					iat: 0,
					exp: 9999999999,
					aud: "test",
					iss: "https://accounts.google.com",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "google-access-token",
					id_token: idToken,
				});
			}),
		);
	}

	function mockGithubToken(login: string, id: number, email: string) {
		server.use(
			http.post("https://github.com/login/oauth/access_token", async () => {
				return HttpResponse.json({ access_token: "github-access-token" });
			}),
			http.get("https://api.github.com/user", async () => {
				return HttpResponse.json({ id, login, name: login, email });
			}),
			http.get("https://api.github.com/user/emails", async () => {
				return HttpResponse.json([{ email, primary: true, verified: true }]);
			}),
		);
	}

	it("does not match a different issuer with the same provider account id", async () => {
		// User A signs up through Google with a shared provider account ID.
		const userAEmail = "user-a@example.com";
		mockGoogleToken(userAEmail, SHARED_ACCOUNT_ID);

		const userAHeaders = new Headers();
		const googleSignIn = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: { onSuccess: cookieSetter(userAHeaders) },
		});
		const stateA =
			new URL(googleSignIn.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state: stateA, code: "test_code" },
			method: "GET",
			headers: userAHeaders,
			onError(ctx) {
				cookieSetter(userAHeaders)(ctx as any);
			},
		});

		const sessionA = await client.getSession({
			fetchOptions: { headers: userAHeaders },
		});
		expect(sessionA.data?.user.email).toBe(userAEmail);
		const userAId = sessionA.data!.user.id;

		// User B: separate email/password account
		const userBEmail = "user-b@example.com";
		const userBHeaders = new Headers();
		await client.signUp.email(
			{
				email: userBEmail,
				password: "password123",
				name: "User B",
			},
			{ onSuccess: cookieSetter(userBHeaders) },
		);

		// User B tries to link GitHub — GitHub returns the same provider account ID
		// as User A's Google account. Without the issuer-scoped key, the lookup
		// would find User A's Google account and return "account_already_linked_to_different_user".
		mockGithubToken("user-b-gh", Number(SHARED_ACCOUNT_ID), userBEmail);

		const linkRes = await client.linkSocial(
			{ provider: "github", callbackURL: "/settings" },
			{ headers: userBHeaders, onSuccess: cookieSetter(userBHeaders) },
		);
		expect(linkRes.error).toBeNull();

		const stateB = new URL(linkRes.data!.url!).searchParams.get("state") || "";
		let redirectLocation = "";
		await client.$fetch("/callback/github", {
			query: { state: stateB, code: "test_code" },
			method: "GET",
			headers: userBHeaders,
			onError(ctx) {
				redirectLocation = ctx.response.headers.get("location") || "";
				cookieSetter(userBHeaders)(ctx as any);
			},
		});

		// Should redirect to /settings without error
		expect(redirectLocation).not.toContain("error");
		expect(redirectLocation).toContain("/settings");

		// User B should have a GitHub account linked
		const sessionB = await client.getSession({
			fetchOptions: { headers: userBHeaders },
		});
		const userBId = sessionB.data!.user.id;

		const accountsB = await ctx.adapter.findMany<{
			providerId: string;
			issuer: string;
			providerAccountId: string;
			userId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: userBId }],
		});

		const githubAccount = accountsB.find((a) => a.providerId === "github");
		expect(githubAccount).toBeTruthy();
		expect(githubAccount?.issuer).toBe("local:github");
		expect(githubAccount?.providerAccountId).toBe(SHARED_ACCOUNT_ID);
		expect(githubAccount?.userId).toBe(userBId);

		// User A's Google account must remain untouched
		const accountsA = await ctx.adapter.findMany<{
			providerId: string;
			userId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: userAId }],
		});
		const googleAccount = accountsA.find((a) => a.providerId === "google");
		expect(googleAccount).toBeTruthy();
		expect(googleAccount?.userId).toBe(userAId);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9124
 */
describe("oauth2 - providers without email", async () => {
	const discordTokenResponse = {
		access_token: "discord-access-token",
		refresh_token: "discord-refresh-token",
		token_type: "Bearer",
		expires_in: 3600,
		scope: "identify email",
	};

	function mockDiscordToken(
		id: string,
		username: string,
		email: string | null = null,
	) {
		server.use(
			http.post("https://discord.com/api/oauth2/token", async () =>
				HttpResponse.json(discordTokenResponse),
			),
			http.get("https://discord.com/api/users/*", async () =>
				HttpResponse.json({
					id,
					username,
					discriminator: "0",
					global_name: username,
					avatar: null,
					mfa_enabled: false,
					banner: null,
					accent_color: null,
					locale: "en-US",
					verified: email !== null,
					email,
					flags: 0,
					premium_type: 0,
					public_flags: 0,
					display_name: username,
					avatar_decoration: null,
					banner_color: null,
				} satisfies Omit<DiscordProfile, "image_url">),
			),
		);
	}

	describe("with mapProfileToUser attempting to redefine provider identity", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				discord: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					// Simulate an untyped JavaScript integration. TypeScript rejects this
					// field, and the runtime must ignore it as an identity source.
					mapProfileToUser: () => ({ id: "mapped-profile-id" }) as never,
				},
			},
		});

		const ctx = await auth.$context;

		/**
		 * @see https://github.com/better-auth/better-auth/issues/9454
		 */
		it("uses the verified raw profile subject instead of a mapped id", async () => {
			const providerAccountId = "920138789012345000";
			const email = "mapped-id@example.com";
			mockDiscordToken(providerAccountId, "mapped-id", email);
			const discordProvider = ctx.socialProviders.find(
				(provider) => provider.id === "discord",
			)!;
			const providerInfo = await discordProvider.getUserInfo({
				accessToken: discordTokenResponse.access_token,
			});
			expect(providerInfo?.data).toMatchObject({ id: providerAccountId });
			expect(providerInfo?.user).toMatchObject({
				id: "mapped-profile-id",
			});
			const originalAccountSubject = discordProvider.accountSubject;
			assert(
				typeof originalAccountSubject === "function",
				"Discord should resolve its subject from the raw profile",
			);
			const accountSubject = vi.fn(originalAccountSubject);
			discordProvider.accountSubject = accountSubject;

			const oAuthHeaders = new Headers();
			const signInRes = await client.signIn.social({
				provider: "discord",
				callbackURL: "/",
				fetchOptions: {
					onSuccess: cookieSetter(oAuthHeaders),
				},
			});

			const state =
				new URL(signInRes.data!.url!).searchParams.get("state") || "";
			let sessionHeaders = new Headers();
			await client.$fetch("/callback/discord", {
				query: { state, code: "test_code" },
				method: "GET",
				headers: oAuthHeaders,
				onError(context) {
					sessionHeaders = new Headers();
					cookieSetter(sessionHeaders)(context);
				},
			});
			expect(accountSubject).toHaveBeenCalledWith(
				expect.objectContaining({
					profile: expect.objectContaining({ id: providerAccountId }),
				}),
			);
			const session = await client.getSession({
				fetchOptions: { headers: sessionHeaders },
			});
			expect(session.data?.user.email).toBe(email);

			const account = await ctx.adapter.findOne<{
				providerAccountId: string;
				providerId: string;
			}>({
				model: "account",
				where: [
					{ field: "providerAccountId", value: providerAccountId },
					{ field: "providerId", value: "discord" },
				],
			});
			expect(account).not.toBeNull();
		});
	});

	// Preserve existing coverage for custom profile mapping that only augments
	// optional fields without removing the provider account identifier.
	describe("with mapProfileToUser synthesizing email", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				discord: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					mapProfileToUser: (profile) => ({
						email: profile.email ?? `${profile.id}@discord.placeholder.local`,
					}),
				},
			},
		});

		const ctx = await auth.$context;

		it("signs in a Discord phone-only user with a synthesized email", async () => {
			const discordId = "920138789012345001";
			mockDiscordToken(discordId, "phoneonly");

			const oAuthHeaders = new Headers();
			const signInRes = await client.signIn.social({
				provider: "discord",
				callbackURL: "/",
				fetchOptions: {
					onSuccess: cookieSetter(oAuthHeaders),
				},
			});

			const state =
				new URL(signInRes.data!.url!).searchParams.get("state") || "";
			let redirectLocation = "";
			await client.$fetch("/callback/discord", {
				query: { state, code: "test_code" },
				method: "GET",
				headers: oAuthHeaders,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
					cookieSetter(oAuthHeaders)(context as any);
				},
			});

			expect(redirectLocation).not.toContain("error");

			const synthesizedEmail = `${discordId}@discord.placeholder.local`;
			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: synthesizedEmail }],
			});
			expect(user).toBeTruthy();
			expect(user?.email).toBe(synthesizedEmail);

			const accounts = await ctx.adapter.findMany<{
				providerId: string;
				providerAccountId: string;
			}>({
				model: "account",
				where: [{ field: "userId", value: user!.id }],
			});
			const discordAccount = accounts.find((a) => a.providerId === "discord");
			expect(discordAccount).toBeTruthy();
			expect(discordAccount?.providerAccountId).toBe(discordId);
		});
	});

	describe("without mapProfileToUser", async () => {
		const { client, cookieSetter } = await getTestInstance({
			socialProviders: {
				discord: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});

		it("rejects sign-in with email_not_found when the provider returns a null email", async () => {
			mockDiscordToken("920138789012345002", "phoneonly2");

			const oAuthHeaders = new Headers();
			const signInRes = await client.signIn.social({
				provider: "discord",
				callbackURL: "/",
				fetchOptions: {
					onSuccess: cookieSetter(oAuthHeaders),
				},
			});

			const state =
				new URL(signInRes.data!.url!).searchParams.get("state") || "";
			let redirectLocation = "";
			await client.$fetch("/callback/discord", {
				query: { state, code: "test_code" },
				method: "GET",
				headers: oAuthHeaders,
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});

			expect(redirectLocation).toContain("error=email_not_found");
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7
 */
describe("oauth2 - accountLinking.requireLocalEmailVerified: false opt-out", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		emailAndPassword: { enabled: true },
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
				requireLocalEmailVerified: false,
			},
		},
	});
	const ctx = await auth.$context;

	async function linkGoogleAccount() {
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: mockEmail,
					email_verified: mockEmailVerified,
					name: "Test User",
					picture: "",
					exp: 1,
					sub: "google_opt_out_sub",
					iat: 1,
					aud: "test",
					azp: "test",
					nbf: 1,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Test",
					family_name: "User",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "t",
					refresh_token: "r",
					id_token: idToken,
				});
			}),
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: { onSuccess: cookieSetter(oAuthHeaders) },
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				// The callback ends in a 302 to the callbackURL on success; the
				// HTTP client surfaces that as an error path. Ignore the redirect
				// so the test reaches the post-callback adapter assertions.
				expect(context.response.status).toBe(302);
			},
		});
	}

	it("links the account when local user is unverified and the option opts out", async () => {
		mockEmail = "opt-out@example.com";
		mockEmailVerified = true;
		const signUpRes = await client.signUp.email({
			email: mockEmail,
			password: "password123",
			name: "Opt Out User",
		});
		const userId = signUpRes.data!.user.id;

		await linkGoogleAccount();

		const accounts = await ctx.adapter.findMany<{
			providerId: string;
			userId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		});
		expect(accounts.some((a) => a.providerId === "google")).toBe(true);

		// The legacy emailVerified-promotion path is reachable when the gate is
		// opted out, so the IdP's verified email lifts the local row.
		const promoted = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(promoted?.emailVerified).toBe(true);
	});
});
/**
 * @see https://github.com/better-auth/better-auth/issues/9486
 */
describe("oauth2 - per-provider requireEmailVerification gate", async () => {
	async function setup(config: {
		requireEmailVerification?: boolean | undefined;
		emailPasswordRequireEmailVerification?: boolean | undefined;
		sendOnSignUp?: boolean | undefined;
		sendOnSignIn?: boolean | undefined;
		withoutSendVerificationEmail?: boolean | undefined;
	}) {
		const sendVerificationEmail = vi.fn(async () => {});
		const { auth, client, cookieSetter } = await getTestInstance(
			{
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
						enabled: true,
						requireEmailVerification: config.requireEmailVerification,
					},
				},
				emailAndPassword: {
					enabled: true,
					requireEmailVerification:
						config.emailPasswordRequireEmailVerification,
				},
				emailVerification: {
					sendOnSignUp: config.sendOnSignUp,
					sendOnSignIn: config.sendOnSignIn,
					sendVerificationEmail: config.withoutSendVerificationEmail
						? undefined
						: sendVerificationEmail,
				},
			},
			{ disableTestUser: true },
		);
		const ctx = await auth.$context;

		async function signInViaCallback(profile: {
			email: string;
			email_verified: boolean;
			sub: string;
		}) {
			server.use(
				http.post("https://oauth2.googleapis.com/token", async () => {
					const idToken = await signJWT(
						{
							email: profile.email,
							email_verified: profile.email_verified,
							name: "OAuth User",
							sub: profile.sub,
							iat: 1234567890,
							exp: 1234567890,
							aud: "test",
							iss: "test",
						},
						DEFAULT_SECRET,
					);
					return HttpResponse.json({
						access_token: "test_access_token",
						refresh_token: "test_refresh_token",
						id_token: idToken,
					});
				}),
			);
			const headers = new Headers();
			const signInRes = await client.signIn.social({
				provider: "google",
				callbackURL: "/dashboard",
				newUserCallbackURL: "/welcome",
				fetchOptions: { onSuccess: cookieSetter(headers) },
			});
			const state =
				new URL(signInRes.data!.url!).searchParams.get("state") || "";
			let redirectLocation = "";
			let setCookie = "";
			await client.$fetch("/callback/google", {
				query: { state, code: "test_code" },
				method: "GET",
				headers,
				onError(context) {
					expect(context.response.status).toBe(302);
					redirectLocation = context.response.headers.get("location") || "";
					setCookie = context.response.headers.get("set-cookie") || "";
				},
			});
			return { redirectLocation, setCookie };
		}

		return { ctx, signInViaCallback, sendVerificationEmail };
	}

	function sessionToken(setCookie: string) {
		return parseSetCookieHeader(setCookie).get("better-auth.session_token")
			?.value;
	}

	it("blocks the session for a new user whose provider email is unverified", async () => {
		// No sendOnSignUp: the send is driven by requireEmailVerification (the
		// credential sign-up rule), so a blocked new user still receives a link.
		const { ctx, signInViaCallback, sendVerificationEmail } = await setup({
			requireEmailVerification: true,
		});
		const email = "gate-new-unverified@example.com";

		const { redirectLocation, setCookie } = await signInViaCallback({
			email,
			email_verified: false,
			sub: "gate_new_unverified",
		});

		expect(redirectLocation).toContain("error=email_not_verified");
		expect(sessionToken(setCookie)).toBeUndefined();
		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

		// The user and account are still created; only the session is withheld.
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: email }],
		});
		expect(user?.emailVerified).toBe(false);
	});

	it("creates a session for a new user whose provider email is verified", async () => {
		const { signInViaCallback, sendVerificationEmail } = await setup({
			requireEmailVerification: true,
			sendOnSignUp: true,
		});

		const { redirectLocation, setCookie } = await signInViaCallback({
			email: "gate-new-verified@example.com",
			email_verified: true,
			sub: "gate_new_verified",
		});

		expect(redirectLocation).toContain("/welcome");
		expect(redirectLocation).not.toContain("error");
		expect(sessionToken(setCookie)).toBeDefined();
		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});

	it("re-sends and blocks a returning unverified user when sendOnSignIn is set", async () => {
		const { signInViaCallback, sendVerificationEmail } = await setup({
			requireEmailVerification: true,
			sendOnSignIn: true,
		});
		const profile = {
			email: "gate-returning@example.com",
			email_verified: false,
			sub: "gate_returning",
		};

		// The first sign-in creates the user and account, then blocks the session.
		await signInViaCallback(profile);
		sendVerificationEmail.mockClear();

		// The returning sign-in is blocked again and re-sends the email.
		const { redirectLocation, setCookie } = await signInViaCallback(profile);

		expect(redirectLocation).toContain("error=email_not_verified");
		expect(sessionToken(setCookie)).toBeUndefined();
		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
	});

	it("does not gate social sign-in from emailAndPassword.requireEmailVerification", async () => {
		// Only the credential flag is on; the provider opted out, so social
		// sign-in must still succeed for an unverified provider email.
		const { signInViaCallback } = await setup({
			emailPasswordRequireEmailVerification: true,
		});

		const { redirectLocation, setCookie } = await signInViaCallback({
			email: "gate-credential-only@example.com",
			email_verified: false,
			sub: "gate_credential_only",
		});

		expect(redirectLocation).not.toContain("error");
		expect(sessionToken(setCookie)).toBeDefined();
	});

	it("lets a returning verified user through the gate without re-sending", async () => {
		const { signInViaCallback, sendVerificationEmail } = await setup({
			requireEmailVerification: true,
			sendOnSignIn: true,
		});
		const profile = {
			email: "gate-returning-verified@example.com",
			email_verified: true,
			sub: "gate_returning_verified",
		};

		// First sign-in creates the user and issues a session (verified).
		const first = await signInViaCallback(profile);
		expect(sessionToken(first.setCookie)).toBeDefined();

		// The returning, already-verified user still gets a session and no email.
		const { redirectLocation, setCookie } = await signInViaCallback(profile);
		expect(redirectLocation).toContain("/dashboard");
		expect(redirectLocation).not.toContain("error");
		expect(sessionToken(setCookie)).toBeDefined();
		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});

	it("blocks a returning unverified user without re-sending when sendOnSignIn is unset", async () => {
		const { signInViaCallback, sendVerificationEmail } = await setup({
			requireEmailVerification: true,
		});
		const profile = {
			email: "gate-returning-no-resend@example.com",
			email_verified: false,
			sub: "gate_returning_no_resend",
		};

		await signInViaCallback(profile);
		sendVerificationEmail.mockClear();

		const { redirectLocation, setCookie } = await signInViaCallback(profile);
		expect(redirectLocation).toContain("error=email_not_verified");
		expect(sessionToken(setCookie)).toBeUndefined();
		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});

	it("blocks an unverified user even when no sendVerificationEmail is configured", async () => {
		const { signInViaCallback } = await setup({
			requireEmailVerification: true,
			withoutSendVerificationEmail: true,
		});

		const { redirectLocation, setCookie } = await signInViaCallback({
			email: "gate-no-send@example.com",
			email_verified: false,
			sub: "gate_no_send",
		});

		expect(redirectLocation).toContain("error=email_not_verified");
		expect(sessionToken(setCookie)).toBeUndefined();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9959
 */
describe("oauth2 - account-linking logs use the configured logger", async () => {
	const log = vi.fn();
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: { clientId: "test", clientSecret: "test", enabled: true },
		},
		emailAndPassword: {
			enabled: true,
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google"],
			},
		},
		logger: { log },
	});

	const ctx = await auth.$context;

	async function signInWithGoogle(email: string) {
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email,
					email_verified: true,
					name: "Logger Test User",
					picture: "https://example.com/photo.jpg",
					exp: 1234567890,
					sub: "google_logger_link_fail",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Logger",
					family_name: "User",
				};
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: await signJWT(profile, DEFAULT_SECRET),
				});
			}),
		);
		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers,
		});
	}

	it("forwards the failed-link error to the custom logger", async () => {
		const email = "logger-link-fail@example.com";
		const { data } = await client.signUp.email({
			email,
			password: "password123",
			name: "Logger Test User",
		});

		// Pre-verify so the link passes the gate and reaches `linkAccount`.
		await ctx.adapter.update({
			model: "user",
			where: [{ field: "id", value: data!.user.id }],
			update: { emailVerified: true },
		});
		// Force the link to throw, hitting the `c.context.logger.error` branch.
		vi.spyOn(ctx.internalAdapter, "linkAccount").mockRejectedValueOnce(
			new Error("boom"),
		);

		await signInWithGoogle(email);

		expect(log).toHaveBeenCalledWith(
			"error",
			"Unable to link account",
			expect.anything(),
		);
	});
});
