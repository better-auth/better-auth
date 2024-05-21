import { Browser } from "happy-dom";
import { describe, expect } from "vitest";
import { betterAuth } from "../src";
import { memoryAdapter } from "../src/adapters/memory";
import { hashPassword } from "../src/crypto/password";
import type { BetterAuthOptions } from "../src/options";
import { credential } from "../src/providers";
import { github } from "../src/providers/github";
import { DEFAULT_SECRET } from "../src/utils/secret";
import { getH3Server } from "./utils/server";

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
	const options = {
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
		session: {
			updateAge: 0,
			expiresIn: 1000,
		},
		adapter: memoryAdapter(db),
	} satisfies BetterAuthOptions;
	const auth = betterAuth(options);

	getH3Server(auth.handler, 4002);

	const url = "http://localhost:4002/api/auth";
	const getUrl = (path: string) => `${url}${path}`;
	const browser = new Browser();
	const page = browser.newPage();
	const window = page.mainFrame;

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

	it("should return session and without lastName", async () => {
		const token = await window.window
			.fetch(getUrl("/csrf"))
			.then((res) => res.json() as any);
		await page.goto(getUrl("/csrf"));
		const session = await window.window
			.fetch(getUrl("/session"), {
				method: "POST",
				body: JSON.stringify({
					csrfToken: token.csrfToken,
				}),
			})
			.then((res) => {
				return res.json() as any;
			});
		expect(session.user).toMatchObject({
			id: db.user[0]?.id,
			email: db.user[0]?.email,
		});
		expect(session.user).not.toHaveProperty("lastName");
	});
});
