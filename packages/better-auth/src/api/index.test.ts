import { describe, expect, it, vi } from "vitest";
import { getEndpoints } from "./index";
import type { AuthContext } from "../init";
import type { BetterAuthOptions, BetterAuthPlugin } from "../types";
import { createAuthMiddleware } from "./call";

describe("getEndpoints", () => {
	it("should await promise-based context before passing to middleware", async () => {
		const mockContext: AuthContext = {
			baseURL: "http://localhost:3000",
			options: {},
		} as any;

		const middlewareFn = vi.fn().mockResolvedValue({});

		const testPlugin: BetterAuthPlugin = {
			id: "test-plugin",
			middlewares: [
				{
					path: "/test",
					middleware: createAuthMiddleware(async (ctx) => {
						middlewareFn(ctx);
						return {};
					}),
				},
			],
		};

		const options: BetterAuthOptions = {
			plugins: [testPlugin],
		};

		const promiseContext = new Promise<AuthContext>((resolve) => {
			setTimeout(() => resolve(mockContext), 10);
		});

		const { middlewares } = getEndpoints(promiseContext, options);

		const testCtx = {
			request: new Request("http://localhost:3000/test"),
			context: { customProp: "value" },
		};

		await middlewares[0].middleware(testCtx);

		expect(middlewareFn).toHaveBeenCalled();
		const call = middlewareFn.mock.calls[0][0];
		expect(call.context).toMatchObject({
			baseURL: "http://localhost:3000",
			options: {},
			customProp: "value",
		});
	});
});
