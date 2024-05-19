import { describe, expect } from "vitest";
import { getHonoServer } from "./utils/server";
import { betterAuth } from "../src";
import { memoryAdapter } from "../src/adapters/memory";
import { credential } from "../src/providers/credential";

describe("hono", async (it) => {
	const auth = betterAuth({
		adapter: memoryAdapter({}),
		providers: [credential()],
		user: {
			fields: {
				email: { type: "string", required: true },
				emailVerified: { type: "boolean", required: true },
				name: { type: "string", required: true },
			},
		},
	});
	const app = await getHonoServer(auth.handler);
	const url = "http://localhost:4004/api/auth";
	const getUrl = (path: string) => `${url}${path}`;
	it("works", async () => {
		const res = await app.request(getUrl("/csrf"));
		const json = await res.json();
		expect(json).toMatchObject({
			csrfToken: expect.any(String),
		});
	});
});
