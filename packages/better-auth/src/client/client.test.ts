import { describe, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { createAuthClient } from "./react";
import { passkey } from "../providers";
import { createClient } from "better-call/client";

describe("client path to object", async () => {
	const auth = await getTestInstance({
		providers: [
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
				console.log({ url, options });
				return new Response();
			},
		});
		console.log(client.$atoms.$session.get());
	});
});
