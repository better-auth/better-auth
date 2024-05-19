import { describe } from "vitest";
import { getHonoServer } from "./utils/server";
import { betterAuth } from "../src";
import { magicLink } from "../src/providers";
import { memoryAdapter } from "../src/adapters/memory";

describe("magic-link", async (it) => {
	const auth = betterAuth({
		providers: [
			magicLink({
				async sendEmail(email, url) {
					console.log(url);
					await app.request(url);
				},
			}),
		],
		adapter: memoryAdapter({
			user: [
				{
					id: "1",
					email: "bekacru@gmail.com",
				},
			],
			session: [],
			account: [],
		}),
		user: {
			fields: {
				email: {
					type: "string",
				},
			},
		},
		advanced: {
			skipCSRFCheck: true,
		},
	});
	const app = await getHonoServer(auth.handler);

	it("should send ", async () => {
		await app.request("/api/auth/signin", {
			method: "POST",
			body: JSON.stringify({
				provider: "magic-link",
				redirect: {
					success: "/",
					error: "/",
				},
				currentURL: "http://localhost",
				data: {
					email: "bekacru@gmail.com",
				},
			}),
		});
	});
});
