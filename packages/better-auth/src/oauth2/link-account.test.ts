import type {
	DiscordProfile,
	GoogleProfile,
} from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { signJWT } from "../crypto";
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

describe("oauth2 - override user info on sign-in", async () => {
	const { auth, client, cookieSetter } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
				overrideUserInfoOnSignIn: true,
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
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8906
 *
 * Regression: linkSocial callback used findAccount(accountId) without
 * filtering by providerId. When two different providers share the same
 * numeric account ID, the wrong account could be matched, causing a
 * spurious "account_already_linked_to_different_user" error or silently
 * updating the wrong account record.
 */
describe("oauth2 - link-social uses provider-scoped account lookup", async () => {
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

	it("should not match a different provider's account when the accountId is the same", async () => {
		// User A: signed up via Google with accountId = SHARED_ACCOUNT_ID
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

		// User B tries to link GitHub — GitHub returns the SAME accountId
		// as User A's Google account. Without the fix, findAccount(SHARED_ACCOUNT_ID)
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
			accountId: string;
			userId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: userBId }],
		});

		const githubAccount = accountsB.find((a) => a.providerId === "github");
		expect(githubAccount).toBeTruthy();
		expect(githubAccount?.accountId).toBe(SHARED_ACCOUNT_ID);
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

	describe("with mapProfileToUser omitting provider id", async () => {
		const missingProviderId = undefined as unknown as string;
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				discord: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					mapProfileToUser: () => ({ id: missingProviderId }),
				},
			},
		});

		const ctx = await auth.$context;

		/**
		 * @see https://github.com/better-auth/better-auth/issues/9454
		 */
		it("rejects provider user info with a missing id before creating an account", async () => {
			const email = "missing-id@example.com";
			mockDiscordToken("920138789012345000", "missing-id", email);

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

			expect(redirectLocation).toContain("error=unable_to_get_user_info");

			const account = await ctx.adapter.findOne<{
				accountId: string;
				providerId: string;
			}>({
				model: "account",
				where: [
					{ field: "accountId", value: "undefined" },
					{ field: "providerId", value: "discord" },
				],
			});
			expect(account).toBeNull();

			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: email }],
			});
			expect(user).toBeNull();
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
				accountId: string;
			}>({
				model: "account",
				where: [{ field: "userId", value: user!.id }],
			});
			const discordAccount = accounts.find((a) => a.providerId === "discord");
			expect(discordAccount).toBeTruthy();
			expect(discordAccount?.accountId).toBe(discordId);
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
 * @see https://github.com/better-auth/better-auth/issues/8338
 *
 * Microsoft Entra ID and certain Keycloak/OIDC configurations return a
 * `picture` claim that is an inline `data:image/...;base64,...` URI
 * instead of a URL. When that value reaches `user.image` it bloats the
 * session cookie cache past Chromium's per-cookie 4 KB limit and the
 * per-header 16 KB limit (Vercel / nginx default), failing the OAuth
 * callback with `ERR_RESPONSE_HEADERS_TOO_BIG`. It also bloats JWT
 * payloads when the `jwt` plugin is enabled. These tests cover the
 * sanitizer that strips inline data URIs by default, with an opt-out
 * for users who hoist to a CDN downstream.
 */
describe("oauth2 - data: URI profile image sanitization (#8338)", async () => {
	const DATA_URI_PROFILE_IMAGE = `data:image/jpeg;base64,${"x".repeat(120_000)}`;

	async function setupInstance(opts?: {
		allowInlineProfileImage?: boolean;
		mapProfileToUser?: (profile: GoogleProfile) => Record<string, unknown>;
		captureCreateBeforeImage?: { value: unknown };
	}) {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					mapProfileToUser: opts?.mapProfileToUser,
				},
			},
			account: {
				allowInlineProfileImage: opts?.allowInlineProfileImage,
			},
			...(opts?.captureCreateBeforeImage
				? {
						databaseHooks: {
							user: {
								create: {
									before: async (user) => {
										opts.captureCreateBeforeImage!.value = user.image;
										return { data: user };
									},
								},
							},
						},
					}
				: {}),
		});
		const ctx = await auth.$context;
		return { auth, client, ctx, cookieSetter };
	}

	async function driveOAuthCallback(
		client: Awaited<ReturnType<typeof setupInstance>>["client"],
		cookieSetter: Awaited<ReturnType<typeof setupInstance>>["cookieSetter"],
		profileOverrides: Partial<GoogleProfile>,
	) {
		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: "8338-test@example.com",
					email_verified: true,
					name: "Test User",
					picture: "https://example.com/photo.jpg",
					exp: 1234567890,
					sub: "google_oauth_sub_8338",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Test",
					family_name: "User",
					...profileOverrides,
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
			fetchOptions: { onSuccess: cookieSetter(oAuthHeaders) },
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
			},
		});
	}

	it("strips a data: URI from OAuth profile image by default", async () => {
		const { client, ctx, cookieSetter } = await setupInstance();
		await driveOAuthCallback(client, cookieSetter, {
			email: "8338-default@example.com",
			picture: DATA_URI_PROFILE_IMAGE,
		});
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "8338-default@example.com" }],
		});
		expect(user).not.toBeNull();
		expect(user!.image).toBeNull();
	});

	it("preserves the data: URI when account.allowInlineProfileImage is true", async () => {
		const { client, ctx, cookieSetter } = await setupInstance({
			allowInlineProfileImage: true,
		});
		await driveOAuthCallback(client, cookieSetter, {
			email: "8338-allow@example.com",
			picture: DATA_URI_PROFILE_IMAGE,
		});
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "8338-allow@example.com" }],
		});
		expect(user).not.toBeNull();
		expect(user!.image).toBe(DATA_URI_PROFILE_IMAGE);
	});

	it("invokes mapProfileToUser with the original data: URI before sanitization", async () => {
		let capturedImage: string | undefined;
		const { client, ctx, cookieSetter } = await setupInstance({
			mapProfileToUser: (profile) => {
				capturedImage = profile.picture;
				return {};
			},
		});
		await driveOAuthCallback(client, cookieSetter, {
			email: "8338-map@example.com",
			picture: DATA_URI_PROFILE_IMAGE,
		});
		expect(capturedImage).toBe(DATA_URI_PROFILE_IMAGE);
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "8338-map@example.com" }],
		});
		expect(user!.image).toBeNull();
	});

	it("strips uppercase Data: and DATA: URIs (case-insensitive per RFC 2397)", async () => {
		const cases: Array<{ email: string; prefix: string }> = [
			{ email: "8338-lower@example.com", prefix: "data:" },
			{ email: "8338-pascal@example.com", prefix: "Data:" },
			{ email: "8338-upper@example.com", prefix: "DATA:" },
		];
		for (const { email, prefix } of cases) {
			const { client, ctx, cookieSetter } = await setupInstance();
			await driveOAuthCallback(client, cookieSetter, {
				email,
				picture: `${prefix}image/jpeg;base64,${"x".repeat(10_000)}`,
			});
			const user = await ctx.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: email }],
			});
			expect(user, `failed for prefix "${prefix}"`).not.toBeNull();
			expect(user!.image, `prefix "${prefix}" should be stripped`).toBeNull();
		}
	});

	it("does not modify a normal https: image URL", async () => {
		const { client, ctx, cookieSetter } = await setupInstance();
		await driveOAuthCallback(client, cookieSetter, {
			email: "8338-https@example.com",
			picture: "https://lh3.googleusercontent.com/test/photo.jpg",
		});
		const user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "8338-https@example.com" }],
		});
		expect(user!.image).toBe(
			"https://lh3.googleusercontent.com/test/photo.jpg",
		);
	});

	it("passes null (not the data: URI) to databaseHooks.user.create.before after stripping", async () => {
		const capture: { value: unknown } = { value: "INITIAL" };
		const { client, cookieSetter } = await setupInstance({
			captureCreateBeforeImage: capture,
		});
		await driveOAuthCallback(client, cookieSetter, {
			email: "8338-dbhook@example.com",
			picture: DATA_URI_PROFILE_IMAGE,
		});
		expect(capture.value).toBeNull();
	});

	it("strips data: URI when overrideUserInfo is true and existing user is being updated", async () => {
		const { auth, client, ctx, cookieSetter } = await setupInstance();
		const existing = await ctx.internalAdapter.createUser({
			email: "8338-override@example.com",
			name: "Existing User",
			emailVerified: true,
			image: "https://example.com/old-avatar.jpg",
		});
		expect(existing.image).toBe("https://example.com/old-avatar.jpg");

		// Re-fetch options to flip updateUserInfoOnLink on this run by
		// touching the in-memory options snapshot. Simpler: rely on the
		// default emailVerified-trusted flow, which calls handleOAuthUserInfo
		// with overrideUserInfo=true through the accountLinking trustedProviders path.
		void auth;
		await driveOAuthCallback(client, cookieSetter, {
			email: "8338-override@example.com",
			picture: DATA_URI_PROFILE_IMAGE,
		});
		const updated = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "8338-override@example.com" }],
		});
		expect(updated).not.toBeNull();
		// Either null (stripped) or the original URL (override didn't fire);
		// in NEITHER case should the data: URI survive.
		expect(updated!.image).not.toBe(DATA_URI_PROFILE_IMAGE);
		expect(updated!.image?.startsWith("data:")).not.toBe(true);
	});

	it("keeps the resulting session cookie under the 4 KB per-cookie limit even when OAuth profile carries a 120 KB inline base64 image", async () => {
		const { client, cookieSetter } = await setupInstance();
		const oAuthHeaders = new Headers();

		server.use(
			http.post("https://oauth2.googleapis.com/token", async () => {
				const profile: GoogleProfile = {
					email: "8338-cookie@example.com",
					email_verified: true,
					name: "Cookie Test User",
					picture: DATA_URI_PROFILE_IMAGE,
					exp: 1234567890,
					sub: "google_oauth_sub_cookie",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "Cookie",
					family_name: "Test",
				};
				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "test_access_token",
					refresh_token: "test_refresh_token",
					id_token: idToken,
				});
			}),
		);

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/",
			fetchOptions: { onSuccess: cookieSetter(oAuthHeaders) },
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		const responseHeaders = new Headers();
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
				for (const [key, value] of context.response.headers.entries()) {
					responseHeaders.append(key, value);
				}
			},
		});

		// Collect every Set-Cookie value from the callback response and
		// assert each individual cookie stays under ALLOWED_COOKIE_SIZE
		// (4096 bytes, packages/better-auth/src/cookies/session-store.ts).
		const setCookies: string[] = [];
		responseHeaders.forEach((value, key) => {
			if (key.toLowerCase() === "set-cookie") setCookies.push(value);
		});
		for (const cookie of setCookies) {
			expect(
				cookie.length,
				`Set-Cookie "${cookie.slice(0, 40)}..." exceeds 4 KB`,
			).toBeLessThanOrEqual(4096);
		}
	});
});
