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

	async function linkGoogleAccount() {
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
		await client.$fetch("/callback/google", {
			query: { state, code: "test_code" },
			method: "GET",
			headers: oAuthHeaders,
			onError(context) {
				expect(context.response.status).toBe(302);
			},
		});
	}

	it("should update emailVerified when linking account with verified email", async () => {
		const testEmail = "test@example.com";

		// Create user with unverified email
		mockEmail = testEmail;
		mockEmailVerified = false;

		const signUpRes = await client.signUp.email({
			email: testEmail,
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

		// Link with Google account that has verified email
		mockEmailVerified = true;
		await linkGoogleAccount();

		// Verify email is now verified
		user = await ctx.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.emailVerified).toBe(true);
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

	it("should allow account linking when email is verified by provider", async () => {
		const testEmail = "verified-provider@example.com";

		await ctx.adapter.create({
			model: "user",
			data: {
				id: "existing-user-verified",
				email: testEmail,
				name: "Existing User",
				emailVerified: false,
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
				emailVerified: false,
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
