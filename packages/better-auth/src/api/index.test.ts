import type {
	AuthContext,
	BetterAuthOptions,
	BetterAuthPlugin,
} from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { getEndpoints, router } from "./index";

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

		await middlewares[0]!.middleware(testCtx);

		expect(middlewareFn).toHaveBeenCalled();
		const call = middlewareFn.mock.calls[0]![0];
		expect(call.context).toMatchObject({
			baseURL: "http://localhost:3000",
			options: {},
			customProp: "value",
		});
	});
});

describe("router onRequest - Form Parsing", async () => {
	const { auth, testUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
	});

	it("should convert form data to JSON for /sign-in/email", async () => {
		const formData = new URLSearchParams({
			email: testUser.email,
			password: testUser.password,
		});

		const request = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Origin: "http://localhost:3000",
				},
				body: formData.toString(),
			},
		);

		const { handler } = router(await auth.$context, auth.options);
		const response = await handler(request);

		// Should not be a content-type error (form was parsed)
		expect(response.status).not.toBe(400);
		// The request should have been processed (might fail auth but not content-type)
		const contentType = response.headers.get("content-type");
		expect(contentType).toBeTruthy();
	});

	it("should convert form data to JSON for /sign-up/email", async () => {
		const email = `test-${Date.now()}@example.com`;
		const formData = new URLSearchParams({
			email,
			password: "password123",
			name: "Test User",
		});

		const request = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Origin: "http://localhost:3000",
				},
				body: formData.toString(),
			},
		);

		const { handler } = router(await auth.$context, auth.options);
		const response = await handler(request);

		// Should not be a content-type error
		expect(response.status).not.toBe(400);
	});

	it("should reject form data on non-allowed endpoints", async () => {
		const formData = new URLSearchParams({
			name: "New Name",
		});

		const request = new Request("http://localhost:3000/api/auth/update-user", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: "http://localhost:3000",
			},
			body: formData.toString(),
		});

		const { handler } = router(await auth.$context, auth.options);
		let response: Response;
		try {
			response = await handler(request);
		} catch (error: any) {
			// If error is thrown, better-call's onError should have converted it
			// But if it's still an error, we need to handle it
			if (error.statusCode) {
				response = new Response(
					JSON.stringify({ message: error.body?.message || error.message }),
					{
						status: error.statusCode,
						headers: { "Content-Type": "application/json" },
					},
				);
			} else {
				throw error;
			}
		}

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
	});

	it("should reject non-JSON, non-form content types on POST", async () => {
		const request = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "text/xml",
					Origin: "http://localhost:3000",
				},
				body: "<xml>data</xml>",
			},
		);

		const { handler } = router(await auth.$context, auth.options);
		let response: Response;
		try {
			response = await handler(request);
		} catch (error: any) {
			// If error is thrown, better-call's onError should have converted it
			if (error.statusCode) {
				response = new Response(
					JSON.stringify({ message: error.body?.message || error.message }),
					{
						status: error.statusCode,
						headers: { "Content-Type": "application/json" },
					},
				);
			} else {
				throw error;
			}
		}

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
	});

	it("should handle disabled paths", async () => {
		const { auth: authWithDisabled } = await getTestInstance({
			disabledPaths: ["/sign-in/email"],
			emailAndPassword: {
				enabled: true,
			},
		});

		const request = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost:3000",
				},
				body: JSON.stringify({ email: "test@test.com", password: "pass" }),
			},
		);

		const { handler } = router(
			await authWithDisabled.$context,
			authWithDisabled.options,
		);
		const response = await handler(request);

		expect(response.status).toBe(404);
	});
});
