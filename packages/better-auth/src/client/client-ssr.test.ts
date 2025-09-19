// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createAuthClient as createVueClient } from "./vue";

it("should call '/api/auth' if no baseURL is provided", async () => {
	const customFetchImpl = vi.fn(async (url: string | Request | URL) => {
		expect(url).toBe("/api/auth/get-session");
		return new Response();
	});
	const originalEnv = process.env;
	process.env = {};
	// use DisposableStack when Node.js 24 is the minimum requirement
	using _ = {
		[Symbol.dispose]() {
			process.env = originalEnv;
		},
	};
	const client = createVueClient({
		fetchOptions: {
			customFetchImpl,
		},
	});
	await client.getSession();
	expect(customFetchImpl).toBeCalled();
});
