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
 * @see https://github.com/better-auth/better-auth/issues/10705
 */
it("should forward client headers when using Vue useSession with useFetch", async () => {
	const headers = { cookie: "better-auth.session_token=session" };
	const useFetch = vi.fn(async () => ({
		data: null,
		error: null,
	}));
	const client = createVueClient({
		fetchOptions: { headers },
	});

	await client.useSession(useFetch);

	expect(useFetch).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({ headers }),
	);
});
