// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createAuthClient as createOctaneClient } from "./octane";

vi.mock("octane", () => ({
	useCallback: vi.fn(),
	useRef: vi.fn(),
	useSyncExternalStore: vi.fn(),
}));

it("should call '/api/auth' for octane client", async () => {
	const customFetchImpl = vi.fn(async (url: string | Request | URL) => {
		new URL(url as string); // asserts the path is fully resolved
		expect(new URL(url as string).pathname).toBe("/api/auth/get-session");
		expect(new URL(url as string).origin).toBe("http://localhost:3000");
		return new Response();
	});
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	// use DisposableStack when Node.js 24 is the minimum requirement
	using _ = {
		[Symbol.dispose]() {
			process.env.BETTER_AUTH_URL = undefined;
		},
	};
	const client = createOctaneClient({
		fetchOptions: {
			customFetchImpl,
		},
	});
	await client.getSession();
	expect(customFetchImpl).toBeCalled();
});
