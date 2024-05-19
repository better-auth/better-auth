import { Browser } from "happy-dom";
import { createAuthClient } from "./../src/client/index";
import { describe, expect } from "vitest";
import { betterAuth } from "../src";
import { memoryAdapter } from "../src/adapters/memory";
import { github } from "../src/providers";
import { getH3Server } from "./utils/server";
import type { BetterAuthOptions } from "../src/options";

describe("client", (it) => {
	const url = "http://localhost:4005/api/auth";
	const options = {
		providers: [
			github({
				clientId: "test",
				clientSecret: "test",
			}),
		],
		adapter: memoryAdapter({}),
		advanced: {
			skipCSRFCheck: false as boolean,
		},
		user: {
			fields: {
				email: { type: "string", required: true },
				emailVerified: { type: "boolean", required: true },
				image: { type: "string", required: false },
				name: { type: "string", required: true },
			},
		},
	} satisfies BetterAuthOptions;
	const auth = betterAuth(options);

	const browser = new Browser();
	const page = browser.newPage();
	const window = page.mainFrame;
	getH3Server(auth.handler, 4005);

	const client = createAuthClient<typeof auth>()({
		baseURL: url,
		betterFetchOptions: {
			customFetchImpl: async (input, init) => {
				const res = await window.window.fetch(input.toString(), init as any);
				return res as any;
			},
		},
	});
	it("should return 403 with status text csrf token is invalid", async () => {
		const res = await client.signIn({
			provider: "github",
		});
		expect(res.error).toMatchObject({
			status: 403,
			statusText: "Invalid CSRF Token",
		});
	});

	it("should return the authorization url", async () => {
		options.advanced.skipCSRFCheck = true;
		const res = await client.signIn({
			provider: "github",
		});
		expect(res.data).toMatchObject({
			redirect: true,
			url: expect.any(String),
		});
	});
});
