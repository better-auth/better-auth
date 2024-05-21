import { describe, expect, it } from "vitest";
import { betterAuth } from "../src";
import { memoryAdapter } from "../src/adapters/memory";
import { getState } from "../src/oauth2/signin";
import { credential, github } from "../src/providers";
import type { User } from "./../src/adapters/types";
import { emailVerification } from "./../src/plugins/email-verification";
import { getHonoServer } from "./utils/server";

describe("Signup", async () => {
	const db = {
		user: [] as User[],
		session: [],
		account: [],
	};
	let verifyEmailUrl = "";
	const auth = betterAuth({
		providers: [
			credential(),
			github({
				clientId: "test",
				clientSecret: "test",
			}),
		],
		adapter: memoryAdapter(db),
		advanced: {
			skipCSRFCheck: true,
		},
		plugins: [
			emailVerification({
				async sendEmail(_, url) {
					verifyEmailUrl = url;
				},
				redirectURL: {
					error: "http://localhost:4002",
					success: "http://localhost:4002",
				},
			}),
		],
		user: {
			fields: {
				email: {
					type: "string",
				},
				firstName: {
					type: "string",
				},
				lastName: {
					type: "string",
				},
				password: {
					type: "string",
				},
			},
		},
	});

	const app = await getHonoServer(auth.handler);

	it("should create user and account", async () => {
		await app.request("/api/auth/signup", {
			method: "POST",
			body: JSON.stringify({
				provider: "credential",
				currentURL: "http://localhost:4002",
				data: {
					email: "test@email.com",
					password: "test",
					firstName: "Test",
					lastName: "User",
				},
			}),
		});
		expect(db.user.length).toBe(1);
		expect(db.account.length).toBe(1);
	});

	it("should return error in the query param", async () => {
		const response = await app.request("/api/auth/signup", {
			method: "POST",
			body: JSON.stringify({
				provider: "credential",
				currentURL: "http://localhost:4002",
				data: {
					email: "test@email.com",
					password: "test",
					firstName: "Test",
					lastName: "User",
				},
			}),
		});
		const redirectedLocation = response.headers.get("Location");
		expect(redirectedLocation).eq(
			"http://localhost:4002?error=user_already_exist",
		);
	});

	it("should return authorization url with valid state", async () => {
		const response = await app.request("/api/auth/signup", {
			method: "POST",
			body: JSON.stringify({
				provider: "github",
				currentURL: "http://localhost:4002",
				data: {
					firstName: {
						from: "first_name",
					},
					lastName: {
						from: "last_name",
					},
				},
			}),
		});
		const data = await response.json();
		const url = new URL(data.url);
		const state = getState(url.searchParams.get("state") as string);
		expect(state).toMatchObject({
			hash: expect.any(String),
			currentURL: "http://localhost:4002",
			callbackURL: "http://localhost:4002",
			signUp: {
				data: {
					firstName: { from: "first_name" },
					lastName: { from: "last_name" },
				},
				autoCreateSession: true,
				onlySignUp: true,
			},
		});
	});

	it("should verify email", async () => {
		expect(db.user[0]?.emailVerified).toBe(false);
		const response = await app.request(verifyEmailUrl);
		const redirectedLocation = response.headers.get("Location");
		expect(db.user[0]?.emailVerified).toBe(true);
		expect(response.status).toBe(302);
		expect(redirectedLocation).toBe("http://localhost:4002");
	});
});
