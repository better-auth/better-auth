import { createClient } from "better-call/client";
import { describe, it } from "vitest";
import { passkey } from "../plugins";
import { getTestInstance } from "../test-utils/test-instance";
import { createAuthClient } from "./react";

describe("client path to object", async () => {
	const auth = await getTestInstance({
		plugins: [
			passkey({
				rpID: "test",
				rpName: "test",
			}),
		],
	});

	it("should return a path to object", async () => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			customFetchImpl: async (url, options) => {
				return new Response();
			},
		});
	});
});
