import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { oAuthProxy } from ".";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
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
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("oauth-proxy", () => {
	it("should redirect to proxy url", async () => {
		const { client } = await getTestInstance({
			plugins: [
				oAuthProxy({
					currentURL: "http://preview-localhost:3000",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			headers,
			onError(context) {
				const location = context.response.headers.get("location") ?? "";
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"http://preview-localhost:3000/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
				);
				const cookies = new URL(location).searchParams.get("cookies");
				expect(cookies).toBeTruthy();
			},
		});
	});

	it("shouldn't redirect to proxy url on same origin", async () => {
		const { client, cookieSetter } = await getTestInstance({
			plugins: [oAuthProxy()],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/oauth-proxy-callback");
				expect(location).toContain("/dashboard");
			},
		});
	});

	it("should proxy to the original request url", async () => {
		const { client } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://login.myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"https://myapp.com/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
				);
				const cookies = new URL(location).searchParams.get("cookies");
				expect(cookies).toBeTruthy();
			},
		});
	});

	it("should require state cookie if it's not in proxy url", async () => {
		const { client } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain("state_mismatch");
			},
		});
	});

	it("shouldn't redirect to proxy url on same origin", async () => {
		const { client, cookieSetter } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			headers,
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/oauth-proxy-callback");
				expect(location).toContain("/dashboard");
			},
		});
	});

	describe("stateless mode", () => {
		it("should not call findVerificationValue when storeStateStrategy is cookie", async () => {
			let findVerificationValueCalled = false;

			const { client, cookieSetter, auth } = await getTestInstance({
				baseURL: "https://myapp.com",
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
				session: {
					cookieCache: {
						enabled: true,
						maxAge: 7 * 24 * 60 * 60,
						strategy: "jwe",
						refreshCache: true,
					},
				},
				advanced: {
					oauthConfig: {
						storeStateStrategy: "cookie",
					},
				},
			});

			const headers = new Headers();
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
					onSuccess: cookieSetter(headers),
				},
			);

			const state = new URL(res.url!).searchParams.get("state");
			expect(state).toBeTruthy();

			const ctx = await auth.$context;
			ctx.internalAdapter.findVerificationValue = async () => {
				findVerificationValueCalled = true;
				throw new Error(
					"findVerificationValue should not be called with storeStateStrategy: cookie",
				);
			};

			// This should work with cookie-based state
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				headers,
				onError(context) {
					const location = context.response.headers.get("location") ?? "";
					if (!location) {
						throw new Error("Location header not found");
					}
					// Should redirect to proxy callback with encrypted cookies
					expect(location).toContain(
						"http://preview-localhost:3000/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
					);
					const cookies = new URL(location).searchParams.get("cookies");
					expect(cookies).toBeTruthy();
				},
			});

			// With stateless mode, OAuth proxy hook should NOT call
			// findVerificationValue since state data is in the cookie, not database
			expect(findVerificationValueCalled).toBe(false);
		});

		it("should work with secondary storage and cookie state", async () => {
			let findVerificationValueCalled = false;
			const storage = new Map<string, string>();

			const { client, cookieSetter, auth } = await getTestInstance({
				baseURL: "https://myapp.com",
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
				session: {
					cookieCache: {
						enabled: true,
						maxAge: 5 * 60, // 5 minutes
						refreshCache: false,
					},
				},
				secondaryStorage: {
					get: async (key) => storage.get(key) || null,
					set: async (key, value) => {
						storage.set(key, value);
					},
					delete: async (key) => {
						storage.delete(key);
					},
				},
				advanced: {
					oauthConfig: {
						storeStateStrategy: "cookie",
					},
				},
			});

			const headers = new Headers();
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
					onSuccess: cookieSetter(headers),
				},
			);

			const state = new URL(res.url!).searchParams.get("state");
			expect(state).toBeTruthy();

			const ctx = await auth.$context;
			ctx.internalAdapter.findVerificationValue = async () => {
				findVerificationValueCalled = true;
				throw new Error(
					"findVerificationValue should not be called with storeStateStrategy: cookie",
				);
			};

			// This should work with cookie-based state even with secondary storage
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				headers,
				onError(context) {
					const location = context.response.headers.get("location") ?? "";
					if (!location) {
						throw new Error("Location header not found");
					}
					// Should redirect to proxy callback with encrypted cookies
					expect(location).toContain(
						"http://preview-localhost:3000/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
					);
					const cookies = new URL(location).searchParams.get("cookies");
					expect(cookies).toBeTruthy();
				},
			});

			// Even with secondary storage, if storeStateStrategy is "cookie",
			// OAuth proxy should NOT call database for state verification
			expect(findVerificationValueCalled).toBe(false);
		});
	});
});
