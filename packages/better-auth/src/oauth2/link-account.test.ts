import type { GoogleProfile } from "@better-auth/core/social-providers";
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
