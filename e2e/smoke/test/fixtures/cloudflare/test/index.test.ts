import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function createTestCredentials() {
	return {
		email: `${crypto.randomUUID()}@test.com`,
		name: crypto.randomUUID().replaceAll("-", "").slice(6),
		password: crypto.randomUUID(),
	};
}

function signUpWithEmail(
	credentials: ReturnType<typeof createTestCredentials>,
) {
	return SELF.fetch("http://localhost:8787/api/auth/sign-up/email", {
		method: "POST",
		body: JSON.stringify(credentials),
		headers: {
			"content-type": "application/json",
		},
	});
}

describe("Cloudflare Worker compatibly basic tests", () => {
	it("can sign up and login", async () => {
		const credentials = createTestCredentials();
		// Sign Up
		let response = await signUpWithEmail(credentials);
		expect(response.status).toBe(200);

		// Login with correct password
		response = await SELF.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({
					email: credentials.email,
					password: credentials.password,
				}),
				headers: {
					"content-type": "application/json",
				},
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain("better-auth.session");

		const token = response.headers.get("set-cookie")?.split(";")[0];
		expect(token).toBeDefined();

		// Get Auth Status
		response = await SELF.fetch("http://localhost:8787/", {
			headers: {
				Cookie: token!,
			},
		});
		expect(response.status).toBe(200);
		expect(await response.text()!).toBe(`Hello ${credentials.name}`);
	});

	it("returns invalid credentials as an HTTP error without creating a session", async () => {
		const credentials = createTestCredentials();
		const signUpResponse = await signUpWithEmail(credentials);
		expect(signUpResponse.status).toBe(200);

		const response = await SELF.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({
					email: credentials.email,
					password: crypto.randomUUID(),
				}),
				headers: {
					"content-type": "application/json",
				},
			},
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("set-cookie")).toBeNull();
		await expect(response.json()).resolves.toEqual({
			code: "INVALID_EMAIL_OR_PASSWORD",
			message: "Invalid email or password",
		});

		const sessionResponse = await SELF.fetch("http://localhost:8787/");
		expect(sessionResponse.status).toBe(200);
		expect(await sessionResponse.text()).toBe("Not logged in");
	});

	it.each([
		{ adapter: "drizzle" },
		{ adapter: "kysely" },
	])("rolls back a failed $adapter D1 write batch", async ({ adapter }) => {
		const response = await SELF.fetch(
			`http://localhost:8787/test/atomic-writes/${adapter}`,
			{ method: "POST" },
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			supported: true,
			batchRejected: true,
			prefixWriteRolledBack: true,
		});
	});

	it.each([
		{ adapter: "drizzle" },
		{ adapter: "kysely" },
	])("returns ordered results for a successful $adapter D1 write batch", async ({
		adapter,
	}) => {
		const response = await SELF.fetch(
			`http://localhost:8787/test/atomic-writes/${adapter}/results`,
			{ method: "POST" },
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			supported: true,
			resultsAligned: true,
			finalStateCorrect: true,
		});
	});

	it("rolls back email provisioning when the final D1 account write fails", async () => {
		const setupResponse = await SELF.fetch(
			"http://localhost:8787/test/atomic-provisioning/setup",
			{ method: "POST" },
		);
		expect(setupResponse.status).toBe(200);

		const credentials = createTestCredentials();
		const signUpResponse = await SELF.fetch(
			"http://localhost:8787/api/atomic-provisioning/sign-up/email",
			{
				method: "POST",
				body: JSON.stringify(credentials),
				headers: { "content-type": "application/json" },
			},
		);
		expect(signUpResponse.status).toBe(422);

		const statusResponse = await SELF.fetch(
			`http://localhost:8787/test/atomic-provisioning/status?email=${encodeURIComponent(credentials.email)}`,
		);
		expect(statusResponse.status).toBe(200);
		await expect(statusResponse.json()).resolves.toEqual({
			prefixWriteRolledBack: true,
		});
	});
});
