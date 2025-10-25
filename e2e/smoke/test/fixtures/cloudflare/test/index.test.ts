import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Cloudflare Worker compatibly basic tests", () => {
	const randomEmail = `${crypto.randomUUID()}@test.com`;
	const randomUserName = crypto.randomUUID().replaceAll("-", "").slice(6);
	const randomPassword = crypto.randomUUID();

	it("can sign up and login", async () => {
		// Sign Up
		let response = await SELF.fetch(
			"http://localhost:8787/api/auth/sign-up/email",
			{
				method: "POST",
				body: JSON.stringify({
					email: randomEmail,
					password: randomPassword,
					name: randomUserName,
				}),
				headers: {
					"content-type": "application/json",
				},
			},
		);
		expect(response.status).toBe(200);

		// Login with correct password
		response = await SELF.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({
					email: randomEmail,
					password: randomPassword,
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
		expect(await response.text()!).toBe(`Hello ${randomUserName}`);

		// Try login with wrong password
		response = await SELF.fetch(
			"http://localhost:8787/api/auth/sign-in/email",
			{
				method: "POST",
				body: JSON.stringify({
					email: randomEmail,
					// wrong password
					password: crypto.randomUUID(),
				}),
				headers: {
					"content-type": "application/json",
				},
			},
		);
		expect(response.status).toBe(401);
		expect(response.headers.get("set-cookie")).toBeNull();

		response = await SELF.fetch("http://localhost:8787/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Not logged in");
	});
});
