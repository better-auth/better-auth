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
