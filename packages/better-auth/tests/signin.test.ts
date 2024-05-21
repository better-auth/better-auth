import { Browser } from "happy-dom";
import { describe, expect } from "vitest";
import { betterAuth } from "../src";
import { memoryAdapter } from "../src/adapters/memory";
import { hashPassword } from "../src/crypto/password";
import { credential } from "../src/providers";
import { github } from "../src/providers/github";
import { getH3Server } from "./utils/server";
import { DEFAULT_SECRET } from "../src/utils/secret";

describe("signin handler", async (it) => {
	const db = {
		user: [
			{
				id: "1234",
				email: "test@email.com",
				password: await hashPassword("test", DEFAULT_SECRET),
				firstName: "Test",
				lastName: "User",
			},
		],
		session: [],
	};
	const auth = betterAuth({
		providers: [
			credential(),
			github({
				clientId: "test",
				clientSecret: "test",
			}),
		],
		user: {
			fields: {
				firstName: {
					type: "string",
				},
				lastName: {
					type: "string",
					returned: false,
				},
			},
		},
		adapter: memoryAdapter(db),
	});

	getH3Server(auth.handler, 4001);

	const url = "http://localhost:4001/api/auth";
	const getUrl = (path: string) => `${url}${path}`;
	const browser = new Browser();
	const page = browser.newPage();
	const window = page.mainFrame;

	it("should throw provider missing error", async () => {
		await page.goto(getUrl("/csrf"));
		const token = await window.window
			.fetch(getUrl("/csrf"))
			.then((res) => res.json() as any);
		await expect(async () => {
			await window.window
				.fetch(getUrl("/signin"), {
					method: "POST",
					body: JSON.stringify({
						csrfToken: token.csrfToken,
						provider: "test",
						currentURL: "http://localhost:4001",
					}),
				})
				.then((res) => {
					if (!res.ok) {
						throw new Error(res.statusText);
					}
				});
		}).rejects.toThrowError();
	});

	it("should generate authorization url", async () => {
		await page.goto(getUrl("/csrf"));
		const token = await window.window
			.fetch(getUrl("/csrf"))
			.then((res) => res.json() as any);
		const response = await window.window
			.fetch(getUrl("/signin"), {
				method: "POST",
				body: JSON.stringify({
					csrfToken: token.csrfToken,
					currentURL: "http://localhost:4001",
					provider: "github",
				}),
			})
			.then((res) => res.json())
			.then((res) => res as unknown as { url: string; redirect: boolean });
		expect(response).toMatchObject({ url: expect.any(String), redirect: true });
	});

	it("should signin with custom provider", async () => {
		await page.goto(getUrl("/csrf"));
		const token = await window.window
			.fetch(getUrl("/csrf"))
			.then((res) => res.json() as any);
		const response = await window.window
			.fetch(getUrl("/signin"), {
				method: "POST",
				body: JSON.stringify({
					csrfToken: token.csrfToken,
					provider: "credential",
					data: {
						identifier: "test@email.com",
						password: "test",
					},
					currentURL: "http://localhost:4001",
				}),
			})
			.then(async (res) => {
				if (res.ok) {
					return res.json() as unknown as { sessionToken: string };
				}
				throw new Error(await res.text());
			});

		expect(response.sessionToken).toBeDefined();
	});
});
