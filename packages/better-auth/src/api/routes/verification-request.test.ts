import { describe, expect, it, vi } from "vitest";
import { username } from "../../plugins/username";
import { usernameClient } from "../../plugins/username/client";
import { getTestInstance } from "../../test-utils/test-instance";

/** @see https://github.com/better-auth/better-auth/pull/8915 */
describe("verification lifecycle request bodies", () => {
	it.each([
		"sign-up/email",
		"sign-in/username",
		"sign-in/social",
	])("preserves independent JSON bodies for sender and lifecycle on %s", async (path) => {
		const sent = vi.fn();
		const observed = vi.fn();
		const sender = vi.fn(async (_data: unknown, request?: Request) => {
			sent(await request!.json());
		});
		const callback = vi.fn(async (_data: unknown, request?: Request) => {
			observed(await request!.json());
		});
		const { auth, client, testUser } = await getTestInstance(
			{
				plugins: [username()],
				emailAndPassword: { enabled: true, requireEmailVerification: true },
				emailVerification: {
					sendOnSignUp: path !== "sign-in/username",
					sendOnSignIn: true,
					sendVerificationEmail: sender,
					onEmailVerificationRequested: callback,
				},
				socialProviders: {
					google: {
						clientId: "test-client",
						clientSecret: "test-secret",
						verifyIdToken: async () => true,
						getUserInfo: async () => ({
							user: {
								name: "OAuth",
								email: "oauth@example.com",
								emailVerified: false,
							},
							data: {
								sub: "google-user",
								aud: "test-client",
								azp: "test-client",
								exp: Math.floor(Date.now() / 1000) + 3600,
								iat: Math.floor(Date.now() / 1000),
								iss: "https://accounts.google.com",
								name: "OAuth",
								given_name: "OAuth",
								family_name: "User",
								picture: "https://example.com/avatar.png",
								email: "oauth@example.com",
								email_verified: false,
							},
						}),
					},
				},
			},
			{ disableTestUser: true, clientOptions: { plugins: [usernameClient()] } },
		);
		if (path === "sign-in/username") {
			await client.signUp.email({
				name: testUser.name,
				email: testUser.email,
				password: testUser.password,
				username: "requestuser",
			});
		}
		sent.mockClear();
		observed.mockClear();
		sender.mockClear();
		callback.mockClear();
		const body =
			path === "sign-in/social"
				? { provider: "google", idToken: { token: "test-token" } }
				: path === "sign-in/username"
					? { username: "requestuser", password: testUser.password }
					: {
							name: testUser.name,
							email: testUser.email,
							password: testUser.password,
						};
		const context = await auth.$context;
		const response = await auth.handler(
			new Request(`${context.baseURL}/${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
		expect(response.status).toBe(path === "sign-in/username" ? 403 : 200);
		expect(sender).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledOnce();
		expect(sent).toHaveBeenCalledWith(body);
		expect(observed).toHaveBeenCalledWith(body);
		expect(sender.mock.calls[0]![1]).not.toBe(callback.mock.calls[0]![1]);
	});
});
