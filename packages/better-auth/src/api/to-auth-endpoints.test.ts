import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { APIError } from "better-call";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { init } from "../context/init";
import { getTestInstance } from "../test-utils/test-instance";
import { toAuthEndpoints } from "./to-auth-endpoints";

describe("before hook", async () => {
	describe("context", async () => {
		const endpoints = {
			query: createAuthEndpoint(
				"/query",
				{
					method: "GET",
				},
				async (c) => {
					return c.query;
				},
			),
			body: createAuthEndpoint(
				"/body",
				{
					method: "POST",
				},
				async (c) => {
					return c.body;
				},
			),
			params: createAuthEndpoint(
				"/params",
				{
					method: "GET",
				},
				async (c) => {
					return c.params;
				},
			),
			headers: createAuthEndpoint(
				"/headers",
				{
					method: "GET",
					requireHeaders: true,
				},
				async (c) => {
					return Object.fromEntries(c.headers.entries());
				},
			),
		};

		const authContext = init({
			hooks: {
				before: createAuthMiddleware(async (c) => {
					switch (c.path) {
						case "/body":
							return {
								context: {
									body: {
										name: "body",
									},
								},
							};
						case "/params":
							return {
								context: {
									params: {
										name: "params",
									},
								},
							};
						case "/headers":
							return {
								context: {
									headers: new Headers({
										name: "headers",
									}),
								},
							};
					}
					return {
						context: {
							query: {
								name: "query",
							},
						},
					};
				}),
			},
		});
		const authEndpoints = toAuthEndpoints(endpoints, authContext);

		it("should return hook set query", async () => {
			const res = await authEndpoints.query();
			expect(res?.name).toBe("query");
			const res2 = await authEndpoints.query({
				query: {
					key: "value",
				},
			});
			expect(res2).toMatchObject({
				name: "query",
				key: "value",
			});
		});

		it("should return hook set body", async () => {
			const res = await authEndpoints.body();
			expect(res?.name).toBe("body");
			const res2 = await authEndpoints.body({
				//@ts-expect-error
				body: {
					key: "value",
				},
			});
			expect(res2).toMatchObject({
				name: "body",
				key: "value",
			});
		});

		it("should return hook set param", async () => {
			const res = await authEndpoints.params();
			expect(res?.name).toBe("params");
			const res2 = await authEndpoints.params({
				params: {
					key: "value",
				},
			});
			expect(res2).toMatchObject({
				name: "params",
				key: "value",
			});
		});

		it("should return hook set headers", async () => {
			const res = await authEndpoints.headers({
				headers: new Headers({
					key: "value",
				}),
			});
			expect(res).toMatchObject({ key: "value", name: "headers" });
		});

		it("should replace existing array when hook provides another array", async () => {
			const endpoint = {
				body: createAuthEndpoint(
					"/body-array-replace",
					{ method: "POST", body: z.object({ tags: z.array(z.string()) }) },
					async (c) => c.body,
				),
			};
			const authContext = init({
				hooks: {
					before: createAuthMiddleware(async (c) => {
						if (c.path === "/body-array-replace") {
							return {
								context: {
									body: {
										tags: ["a"],
									},
								},
							};
						}
					}),
				},
			});
			const api = toAuthEndpoints(endpoint, authContext);

			const res = await api.body({
				body: {
					tags: ["b", "c"],
				},
			});
			expect(res.tags).toEqual(["a"]);
		});
	});

	describe("response", async () => {
		const endpoints = {
			response: createAuthEndpoint(
				"/response",
				{
					method: "GET",
				},
				async (c) => {
					return { response: true };
				},
			),
			json: createAuthEndpoint(
				"/json",
				{
					method: "GET",
				},
				async (c) => {
					return { response: true };
				},
			),
		};

		const authContext = init({
			hooks: {
				before: createAuthMiddleware(async (c) => {
					if (c.path === "/json") {
						return { before: true };
					}
					return new Response(JSON.stringify({ before: true }));
				}),
			},
		});
		const authEndpoints = toAuthEndpoints(endpoints, authContext);

		it("should return Response object", async () => {
			const response = await authEndpoints.response();
			expect(response).toBeInstanceOf(Response);
		});

		it("should return the hook response", async () => {
			const response = await authEndpoints.json();
			expect(response).toMatchObject({ before: true });
		});
	});
});

describe("after hook", async () => {
	describe("response", async () => {
		const endpoints = {
			changeResponse: createAuthEndpoint(
				"/change-response",
				{
					method: "GET",
				},
				async (c) => {
					return {
						hello: "world",
					};
				},
			),
			throwError: createAuthEndpoint(
				"/throw-error",
				{
					method: "POST",
					query: z
						.object({
							throwHook: z.boolean(),
						})
						.optional(),
				},
				async (c) => {
					throw c.error("BAD_REQUEST");
				},
			),
			multipleHooks: createAuthEndpoint(
				"/multi-hooks",
				{
					method: "GET",
				},
				async (c) => {
					return {
						return: "1",
					};
				},
			),
		};

		const authContext = init({
			plugins: [
				{
					id: "test",
					hooks: {
						after: [
							{
								matcher() {
									return true;
								},
								handler: createAuthMiddleware(async (c) => {
									if (c.path === "/multi-hooks") {
										return {
											return: "3",
										};
									}
								}),
							},
						],
					},
				},
			],
			hooks: {
				after: createAuthMiddleware(async (c) => {
					if (c.path === "/change-response") {
						return {
							hello: "auth",
						};
					}
					if (c.path === "/multi-hooks") {
						return {
							return: "2",
						};
					}
					if (c.query?.throwHook) {
						throw c.error("BAD_REQUEST", {
							message: "from after hook",
						});
					}
				}),
			},
		});

		const api = toAuthEndpoints(endpoints, authContext);

		it("should change the response object from `hello:world` to `hello:auth`", async () => {
			const response = await api.changeResponse();
			expect(response).toMatchObject({ hello: "auth" });
		});

		it("should return the last hook returned response", async () => {
			const response = await api.multipleHooks();
			expect(response).toMatchObject({
				return: "3",
			});
		});

		it("should return error as response", async () => {
			const response = await api.throwError({
				asResponse: true,
			});
			expect(response.status).toBe(400);
		});

		it("should throw the last error", async () => {
			await api
				.throwError({
					query: {
						throwHook: true,
					},
				})
				.catch((e) => {
					expect(e).toBeInstanceOf(APIError);
					expect(e?.message).toBe("from after hook");
				});
		});
	});

	describe("cookies", async () => {
		const endpoints = {
			cookies: createAuthEndpoint(
				"/cookies",
				{
					method: "POST",
				},
				async (c) => {
					c.setCookie("session", "value");
					return { hello: "world" };
				},
			),
			cookieOverride: createAuthEndpoint(
				"/cookie",
				{
					method: "GET",
				},
				async (c) => {
					c.setCookie("data", "1");
				},
			),
			noCookie: createAuthEndpoint(
				"/no-cookie",
				{
					method: "GET",
				},
				async (c) => {},
			),
		};

		const authContext = init({
			hooks: {
				after: createAuthMiddleware(async (c) => {
					c.setHeader("key", "value");
					c.setCookie("data", "2");
				}),
			},
		});

		const authEndpoints = toAuthEndpoints(endpoints, authContext);

		it("set cookies from both hook", async () => {
			const result = await authEndpoints.cookies({
				asResponse: true,
			});
			expect(result.headers.get("set-cookie")).toContain("session=value");
			expect(result.headers.get("set-cookie")).toContain("data=2");
		});

		it("should override cookie", async () => {
			const result = await authEndpoints.cookieOverride({
				asResponse: true,
			});
			expect(result.headers.get("set-cookie")).toContain("data=2");
		});

		it("should only set the hook cookie", async () => {
			const result = await authEndpoints.noCookie({
				asResponse: true,
			});
			expect(result.headers.get("set-cookie")).toContain("data=2");
		});

		it("should return cookies from return headers", async () => {
			const result = await authEndpoints.noCookie({
				returnHeaders: true,
			});
			expect(result.headers.get("set-cookie")).toContain("data=2");

			const result2 = await authEndpoints.cookies({
				asResponse: true,
			});
			expect(result2.headers.get("set-cookie")).toContain("session=value");
			expect(result2.headers.get("set-cookie")).toContain("data=2");
		});
	});
});

describe("disabled paths", async () => {
	it("should return 404 for disabled paths", async () => {
		const { client, auth } = await getTestInstance({
			disabledPaths: ["/sign-in/email"],
		});

		const response = await client.$fetch("/ok");
		expect(response.data).toEqual({ ok: true });
		const { error } = await client.signIn.email({
			email: "test@test.com",
			password: "test",
		});
		expect(error?.status).toBe(404);
	});

	it("should return 404 for when base path is /", async () => {
		const { auth } = await getTestInstance({
			basePath: "/",
			disabledPaths: ["/sign-in/email"],
		});

		const response2 = await auth.handler(
			new Request("http://localhost:3000/sign-in/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					email: "test@test.com",
					password: "test",
				}),
			}),
		);
		expect(response2).toBeInstanceOf(Response);
	});

	it("should return 404 for disabled paths with a trailing slash", async () => {
		const { auth } = await getTestInstance({
			disabledPaths: ["/sign-in/email"],
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/email/", {
				method: "POST",
			}),
		);
		expect(response.status).toBe(404);
	});
});

describe("debug mode stack trace", () => {
	it("should preserve stack trace when logger is in debug mode and APIError is thrown", async () => {
		const endpoints = {
			testEndpoint: createAuthEndpoint(
				"/test-error",
				{ method: "GET" },
				async () => {
					throw new APIError("BAD_REQUEST", { message: "Test error" });
				},
			),
		};

		const authContext = init({
			logger: {
				level: "debug",
			},
		});

		const api = toAuthEndpoints(endpoints, authContext);

		try {
			await api.testEndpoint({});
		} catch (error: any) {
			expect(error).toBeInstanceOf(APIError);
			expect(error.stack).toBeDefined();
			expect(error.stack).toMatch(/ErrorWithStack:|Error:|APIError:/);
			expect(error.stack).toMatch(/at\s+/);
		}
	});

	it("should not modify stack trace when logger is not in debug mode", async () => {
		const endpoints = {
			testEndpoint: createAuthEndpoint(
				"/test-error",
				{ method: "GET" },
				async () => {
					throw new APIError("BAD_REQUEST", { message: "Test error" });
				},
			),
		};

		const authContext = init({
			logger: {
				level: "error", // Not debug mode
			},
		});

		const api = toAuthEndpoints(endpoints, authContext);

		try {
			await api.testEndpoint({});
		} catch (error: any) {
			expect(error).toBeInstanceOf(APIError);
			// Stack should exist but may be minimal when not in debug mode
			expect(error.stack).toBeDefined();
		}
	});

	it("should have detailed stack trace in debug mode", async () => {
		const endpoints = {
			testEndpoint: createAuthEndpoint(
				"/test-error",
				{ method: "GET" },
				async () => {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Internal error occurred",
					});
				},
			),
		};

		const authContext = init({
			logger: {
				level: "debug",
			},
		});

		const api = toAuthEndpoints(endpoints, authContext);

		try {
			await api.testEndpoint({});
		} catch (error: any) {
			expect(error).toBeInstanceOf(APIError);
			expect(error.stack).toBeDefined();
			// Check for stack trace format
			expect(error.stack).toMatch(/at\s+.*\(.*\)/); // Match "at functionName (file:line:col)"
			expect(error.stack).toMatch(/\.ts:\d+:\d+/); // Match TypeScript file with line:column
		}
	});

	it("should handle APIError in hooks with debug mode", async () => {
		const endpoints = {
			testEndpoint: createAuthEndpoint(
				"/test-hook-error",
				{ method: "GET" },
				async () => {
					return { data: "success" };
				},
			),
		};

		const authContext = init({
			logger: {
				level: "debug",
			},
			hooks: {
				before: createAuthMiddleware(async () => {
					throw new APIError("FORBIDDEN", { message: "Forbidden action" });
				}),
			},
		});

		const api = toAuthEndpoints(endpoints, authContext);

		try {
			await api.testEndpoint({});
		} catch (error: any) {
			expect(error).toBeInstanceOf(APIError);
			expect(error.stack).toBeDefined();
			expect(error.stack).toMatch(/ErrorWithStack:|Error:|APIError:/);
			expect(error.stack).toMatch(/at\s+/);
		}
	});

	it("should handle Response containing APIError in debug mode", async () => {
		const endpoints = {
			testEndpoint: createAuthEndpoint(
				"/test-response-error",
				{ method: "GET" },
				async () => {
					throw new APIError("UNAUTHORIZED", {
						message: "Unauthorized access",
					});
				},
			),
		};

		const authContext = init({
			logger: {
				level: "debug",
			},
		});

		const api = toAuthEndpoints(endpoints, authContext);

		// Test with asResponse = true to get Response object
		const response = await api.testEndpoint({ asResponse: true });
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(401);

		// Test with asResponse = false to get thrown error
		try {
			await api.testEndpoint({ asResponse: false });
		} catch (error: any) {
			expect(error).toBeInstanceOf(APIError);
			expect(error.stack).toBeDefined();
			expect(error.stack).toMatch(/ErrorWithStack:|Error:|APIError:/);
		}
	});
});

describe("custom response code", () => {
	const endpoints = {
		responseWithStatus: createAuthEndpoint(
			"/response-with-status",
			{
				method: "GET",
			},
			async (c) => {
				c.setStatus(201);
				return { success: true };
			},
		),
	};

	const authContext = init({});
	const authEndpoints = toAuthEndpoints(endpoints, authContext);

	it("should return response with custom status", async () => {
		const response = await authEndpoints.responseWithStatus({
			asResponse: true,
		});
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(201);
	});

	it("should return status code", async () => {
		const response = await authEndpoints.responseWithStatus({
			returnStatus: true,
		});
		expect(response.status).toBe(201);
		expect(response.response).toEqual({ success: true });
	});
});
