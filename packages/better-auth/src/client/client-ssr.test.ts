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

/**
 * @see https://github.com/better-auth/better-auth/issues/5358
 */
it("uses stable Nuxt options for a session fetch", async () => {
	const headers = { cookie: "better-auth.session_token=session" };
	const useFetch = vi.fn(async () => ({
		data: { value: null },
		error: { value: null },
	}));
	const client = createVueClient({
		baseURL: "http://localhost:3000",
		fetchOptions: { headers },
	});

	await client.useSession(useFetch);

	expect(useFetch).toHaveBeenCalledWith(
		"http://localhost:3000/api/auth/get-session",
		{
			headers,
			key: "better-auth:session:http://localhost:3000:/api/auth",
			watch: [expect.anything()],
		},
	);
});
