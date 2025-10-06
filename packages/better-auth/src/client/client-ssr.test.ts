// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createAuthClient as createVueClient } from "./vue";

it("should call '/api/auth' for vue client", async () => {
	const customFetchImpl = vi.fn(async (url: string | Request | URL) => {
		expect(url).toBe("/api/auth/get-session");
		return new Response();
	});
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	// use DisposableStack when Node.js 24 is the minimum requirement
	using _ = {
		[Symbol.dispose]() {
			process.env.BETTER_AUTH_URL = undefined;
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
