import { createAuthMiddleware } from "@better-auth/core/api";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { getOAuthState } from "better-auth/api";
import { signJWT } from "better-auth/crypto";
import { getTestInstance } from "better-auth/test";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, expect, test } from "vitest";

const DEFAULT_SECRET = "better-auth-secret-123456789";
const mswServer = setupServer();

beforeAll(async () => {
	mswServer.listen({ onUnhandledRequest: "bypass" });
	mswServer.use(
		http.post("https://oauth2.googleapis.com/token", async () => {
			const data: GoogleProfile = {
				email: "user@email.com",
				email_verified: true,
				name: "Test User",
				picture: "https://lh3.googleusercontent.com/a-/test",
				exp: 1234567890,
				sub: "1234567890",
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
			const testIdToken = await signJWT(data, DEFAULT_SECRET);
			return HttpResponse.json({
				access_token: "test-access-token",
				refresh_token: "test-refresh-token",
				id_token: testIdToken,
			});
		}),
	);
});

afterAll(() => mswServer.close());

test("should login with google successfully", async () => {
	let latestOauthStore: Record<string, any> | null = null;
	const { client } = await getTestInstance({
		secret: DEFAULT_SECRET,
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/callback/:id" && ctx.params.id === "google") {
					latestOauthStore = await getOAuthState();
				}
			}),
		},
	});

	const headers = new Headers();

	const signInRes = await client.signIn.social(
		{
			provider: "google",
			callbackURL: "/callback",
			additionalData: {
				invitedBy: "user-123",
			},
		},
		{
			onSuccess(context) {
				const setCookie = context.response.headers.get("set-cookie");
				if (setCookie) {
					headers.set("cookie", setCookie);
				}
			},
		},
	);

	expect(signInRes.data).toMatchObject({
		url: expect.stringContaining("google.com"),
		redirect: true,
	});

	const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

	await client.$fetch("/callback/google", {
		query: {
			state,
			code: "test-authorization-code",
		},
		headers,
		method: "GET",
		onError(context) {
			expect(context.response.status).toBe(302);
			const location = context.response.headers.get("location");
			expect(location).toBeDefined();
			expect(location).toContain("/callback");
		},
	});
	expect(latestOauthStore).toMatchObject({
		callbackURL: "/callback",
		codeVerifier: expect.any(String),
		errorURL: "http://localhost:3000/api/auth/error",
		expiresAt: expect.any(Number),
		invitedBy: "user-123",
	});
});
