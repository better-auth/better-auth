import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Cloudflare Worker compatibility", () => {
	const randomEmail = `${crypto.randomUUID()}@test.com`;
	const randomUserName = crypto.randomUUID().replaceAll("-", "").slice(6);
	const randomPassword = crypto.randomUUID();

	it("can sign up, log in, and read a session", async () => {
		// Sign Up
		let response = await exports.default.fetch(
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
		response = await exports.default.fetch(
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
		response = await exports.default.fetch("http://localhost:8787/", {
			headers: {
				Cookie: token!,
			},
		});
		expect(response.status).toBe(200);
		expect(await response.text()!).toBe(`Hello ${randomUserName}`);

		response = await exports.default.fetch("http://localhost:8787/");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Not logged in");
	});
});
