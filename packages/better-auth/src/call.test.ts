import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { APIError } from "better-call";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { getEndpoints, router } from "./api";
import { createAuthClient } from "./client";
import { init } from "./context/init";
import { bearer } from "./plugins";

describe("call", async () => {
	const q = z.optional(
		z.object({
			testBeforeHook: z.string().optional(),
			testBeforeGlobal: z.string().optional(),
			testAfterHook: z.string().optional(),
			testAfterGlobal: z.string().optional(),
			testContext: z.string().optional(),
			message: z.string().optional(),
		}),
	);
	const testPlugin = {
		id: "test",
		endpoints: {
			test: createAuthEndpoint(
				"/test",
				{
					method: "GET",
					query: q,
				},
				async (ctx) => {
					return ctx.json({ success: ctx.query?.message || "true" });
				},
			),
			testCookies: createAuthEndpoint(
				"/test/cookies",
				{
					method: "POST",
					query: q,
					body: z.object({
						cookies: z.array(z.object({ name: z.string(), value: z.string() })),
					}),
				},
				async (ctx) => {
					for (const cookie of ctx.body.cookies) {
						ctx.setCookie(cookie.name, cookie.value);
					}
					return ctx.json({ success: true });
				},
			),
			testThrow: createAuthEndpoint(
				"/test/throw",
				{
					method: "GET",
					query: q,
				},
				async (ctx) => {
					if (ctx.query?.message === "throw-api-error") {
						throw new APIError("BAD_REQUEST", {
							message: "Test error",
						});
					}
					if (ctx.query?.message === "throw-error") {
						throw new Error("Test error");
					}
					if (ctx.query?.message === "throw redirect") {
						throw ctx.redirect("/test");
					}
					if (ctx.query?.message === "redirect with additional header") {
						ctx.setHeader("key", "value");
						throw ctx.redirect("/test");
					}
					throw new APIError("BAD_REQUEST", {
						message: ctx.query?.message,
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;

	const testPlugin2 = {
		id: "test2",
		hooks: {
			before: [
				{
					matcher(ctx) {
						return ctx.path === "/test";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const query = ctx.query;
						if (!query) {
							return;
						}
						if (query.testBeforeHook) {
							return ctx.json({
								before: "test",
							});
						}
						if (query.testContext) {
							ctx.query = {
								message: query.testContext,
							};
							return {
								context: ctx,
							};
						}
					}),
				},
			],
			after: [
				{
					matcher(ctx) {
						return ctx.path === "/test";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const query = ctx.query?.testAfterHook;
						if (!query) {
							return;
						}

						return ctx.json({
							after: "test",
						});
					}),
				},
				{
					matcher(ctx) {
						return ctx.path === "/test/cookies";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const query = ctx.query?.testAfterHook;
						if (!query) {
							return;
						}
						ctx.setCookie("after", "test");
					}),
				},
				{
					matcher(ctx) {
						return (
							(ctx.path === "/test/throw" &&
								ctx.query?.message === "throw-after-hook") ||
							ctx.query?.message === "throw-chained-hook"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.query?.message === "throw-chained-hook") {
							throw new APIError("BAD_REQUEST", {
								message: "from chained hook 1",
							});
						}
						if (ctx.context.returned instanceof APIError) {
							throw ctx.error("BAD_REQUEST", {
								message: "from after hook",
							});
						}
					}),
				},
				{
					matcher(ctx) {
						return (
							ctx.path === "/test/throw" &&
							ctx.query?.message === "throw-chained-hook"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.context.returned instanceof APIError) {
							const returned = ctx.context.returned;
							const message = returned.message;
							throw new APIError("BAD_REQUEST", {
								message: message.replace("1", "2"),
							});
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
	let latestOauthStore: Record<string, any> | undefined = {};
	const options = {
		baseURL: "http://localhost:3000",
		plugins: [testPlugin, testPlugin2, bearer()],
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: {
			google: {
				clientId: "test-client-id",
				clientSecret: "test-client-secret",
				enabled: true,
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/sign-up/email") {
					return {
						context: {
							body: {
								...ctx.body,
								email: "changed@email.com",
							},
						},
					};
				}
				if (ctx.query?.testBeforeGlobal) {
					return ctx.json({ before: "global" });
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				if (ctx.query?.testAfterGlobal) {
					return ctx.json({ after: "global" });
				}
			}),
		},
	} satisfies BetterAuthOptions;
	const authContext = init(options);
	const { api } = getEndpoints(authContext, options);

	const r = router(await authContext, options);
	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return r.handler(new Request(url, init));
			},
		},
	});

	it("should call api", async () => {
		const response = await api.test();
		expect(response).toMatchObject({
			success: "true",
		});
	});

	it("should set cookies", async () => {
		const response = await api.testCookies({
			body: {
				cookies: [
					{
						name: "test-cookie",
						value: "test-value",
					},
				],
			},
			returnHeaders: true,
		});
		const setCookies = response.headers.get("set-cookie");
		expect(setCookies).toContain("test-cookie=test-value");
	});

	it("should intercept on before hook", async () => {
		const response = await api.test({
			query: {
				testBeforeHook: "true",
			},
		});
		expect(response).toMatchObject({
			before: "test",
		});
	});

	it("should change context on before hook", async () => {
		const response = await api.test({
			query: {
				testContext: "context-changed",
			},
		});
		expect(response).toMatchObject({
			success: "context-changed",
		});
	});

	it("should intercept on after hook", async () => {
		const response = await api.test({
			query: {
				testAfterHook: "true",
			},
		});
		expect(response).toMatchObject({
			after: "test",
		});
	});

	it("should return Response object", async () => {
		const response = await api.test({
			asResponse: true,
		});
		expect(response).toBeInstanceOf(Response);
	});

	it("should set cookies on after hook", async () => {
		const response = await api.testCookies({
			body: {
				cookies: [
					{
						name: "test-cookie",
						value: "test-value",
					},
				],
			},
			query: {
				testAfterHook: "true",
			},
			returnHeaders: true,
		});
		const setCookies = response.headers.get("set-cookie");
		expect(setCookies).toContain("after=test");
		expect(setCookies).toContain("test-cookie=test-value");
	});

	it("should throw APIError", async () => {
		await expect(
			api.testThrow({
				query: {
					message: "throw-api-error",
				},
			}),
		).rejects.toThrowError(APIError);
	});

	it("should throw Error", async () => {
		await expect(
			api.testThrow({
				query: {
					message: "throw-error",
				},
			}),
		).rejects.toThrowError(Error);
	});

	it("should redirect", async () => {
		await api
			.testThrow({
				query: {
					message: "throw redirect",
				},
			})
			.catch((e) => {
				expect(e).toBeInstanceOf(APIError);

				expect(e.status).toBe("FOUND");
				expect(e.headers.get("Location")).toBe("/test");
			});
	});

	it("should include base headers with redirect", async () => {
		await api
			.testThrow({
				query: {
					message: "redirect with additional header",
				},
			})
			.catch((e) => {
				expect(e).toBeInstanceOf(APIError);
				expect(e.status).toBe("FOUND");
				expect(e.headers.get("Location")).toBe("/test");
				expect(e.headers.get("key")).toBe("value");
			});
	});

	it("should throw from after hook", async () => {
		await api
			.testThrow({
				query: {
					message: "throw-after-hook",
				},
			})
			.catch((e) => {
				expect(e).toBeInstanceOf(APIError);
				expect(e.status).toBe("BAD_REQUEST");
				expect(e.message).toContain("from after hook");
			});
	});

	it("should throw from chained hook", async () => {
		await api
			.testThrow({
				query: {
					message: "throw-chained-hook",
				},
			})
			.catch((e) => {
				expect(e).toBeInstanceOf(APIError);
				expect(e.status).toBe("BAD_REQUEST");
				expect(e.message).toContain("from chained hook 2");
			});
	});

	it("should intercept on global before hook", async () => {
		const response = await api.test({
			query: {
				testBeforeGlobal: "true",
			},
		});
		expect(response).toMatchObject({
			before: "global",
		});
	});

	it("should intercept on global after hook", async () => {
		const response = await api.test({
			query: {
				testAfterGlobal: "true",
			},
		});
		expect(response).toMatchObject({
			after: "global",
		});
	});

	it("global before hook should change the context", async (ctx) => {
		const response = await api.signUpEmail({
			body: {
				email: "my-email@test.com",
				password: "password",
				name: "test",
			},
		});
		const session = await api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${response?.token}`,
			}),
		});
		expect(session?.user.email).toBe("changed@email.com");
	});

	it("should fetch using a client", async () => {
		const response = await client.$fetch("/ok");
		expect(response.data).toMatchObject({
			ok: true,
		});
	});

	it("should fetch using a client with query", async () => {
		const response = await client.$fetch("/test", {
			query: {
				message: "test",
			},
		});
		expect(response.data).toMatchObject({
			success: "test",
		});
	});

	it("should set cookies using a client", async () => {
		await client.$fetch("/test/cookies", {
			method: "POST",
			body: {
				cookies: [
					{
						name: "test-cookie",
						value: "test-value",
					},
				],
			},
			onResponse(context) {
				expect(context.response.headers.get("set-cookie")).toContain(
					"test-cookie=test-value",
				);
			},
		});
	});
});
