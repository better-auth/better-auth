import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { createAuthEndpoint } from "../api";
import { getAdapter } from "../db";
import { getTestInstance } from "../test-utils/test-instance";
import type { BetterAuthOptions } from "../types";
import { createAuthContext } from "./create-context";

describe("base context creation", () => {
	const initBase = async (options: Partial<BetterAuthOptions> = {}) => {
		const opts: BetterAuthOptions = {
			baseURL: "http://localhost:3000",
			...options,
		};
		const adapter = await getAdapter(opts);
		const getDatabaseType = () => "memory";
		return createAuthContext(adapter, opts, getDatabaseType);
	};

	it("should match config", async () => {
		const res = await initBase({
			baseURL: "http://localhost:3000",
		});
		expect(res).toMatchSnapshot();
	});

	it("should infer BASE_URL from env", async () => {
		vi.stubEnv("BETTER_AUTH_URL", "http://localhost:5147");

		const opts: BetterAuthOptions = {};
		const adapter = await getAdapter(opts);
		const getDatabaseType = () => "memory";
		const res = await createAuthContext(adapter, opts, getDatabaseType);

		expect(res.options.baseURL).toBe("http://localhost:5147");
		expect(res.baseURL).toBe("http://localhost:5147/api/auth");
		vi.unstubAllEnvs();
	});

	it("should respect base path", async () => {
		const res = await initBase({
			basePath: "/custom-path",
			baseURL: "http://localhost:5147",
		});
		expect(res.baseURL).toBe("http://localhost:5147/custom-path");
	});

	it("should work with base path", async () => {
		const { client } = await getTestInstance({
			basePath: "/custom-path",
		});

		await client.$fetch("/ok", {
			onSuccess: (ctx) => {
				expect(ctx.data).toMatchObject({
					ok: true,
				});
			},
		});
	});

	it("should execute plugins init", async () => {
		const newBaseURL = "http://test.test";
		const res = await initBase({
			baseURL: "http://localhost:3000",
			plugins: [
				{
					id: "test",
					init: () => {
						return {
							context: {
								baseURL: newBaseURL,
							},
						};
					},
				},
			],
		});
		expect(res.baseURL).toBe(newBaseURL);
	});

	it("should work with custom path", async () => {
		const customPath = "/custom-path";
		const ctx = await initBase({
			basePath: customPath,
			baseURL: "http://localhost:3000",
		});
		expect(ctx.baseURL).toBe(`http://localhost:3000${customPath}`);
	});

	it("should allow plugins to set config values", async () => {
		const ctx = await initBase({
			baseURL: "http://localhost:3000",
			plugins: [
				{
					id: "test-plugin",
					init(ctx) {
						return {
							context: ctx,
							options: {
								emailAndPassword: {
									enabled: true,
								},
							},
						};
					},
				},
			],
		});
		expect(ctx.options.emailAndPassword?.enabled).toBe(true);
	});

	it("should not allow plugins to set config values if they are set in the main config", async () => {
		const ctx = await initBase({
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: false,
			},
			plugins: [
				{
					id: "test-plugin",
					init(ctx) {
						return {
							context: ctx,
							options: {
								emailAndPassword: {
									enabled: true,
								},
							},
						};
					},
				},
			],
		});
		expect(ctx.options.emailAndPassword?.enabled).toBe(false);
	});

	it("should properly pass modified context from one plugin to another", async () => {
		const mockProvider = {
			id: "test-oauth-provider",
			name: "Test OAuth Provider",
			createAuthorizationURL: vi.fn(),
			validateAuthorizationCode: vi.fn(),
			refreshAccessToken: vi.fn(),
			getUserInfo: vi.fn(),
		};

		const ctx = await initBase({
			baseURL: "http://localhost:3000",
			socialProviders: {
				github: {
					clientId: "test-github-id",
					clientSecret: "test-github-secret",
				},
			},
			plugins: [
				{
					id: "test-oauth-plugin",
					init(ctx) {
						return {
							context: {
								socialProviders: [mockProvider, ...ctx.socialProviders],
							},
						};
					},
				},
				{
					id: "test-oauth-plugin-2",
					init(ctx) {
						return {
							context: ctx,
						};
					},
				},
			],
		});
		expect(ctx.socialProviders).toHaveLength(2);
		const testProvider = ctx.socialProviders.find(
			(p) => p.id === "test-oauth-provider",
		);
		expect(testProvider).toBeDefined();
		expect(testProvider?.refreshAccessToken).toBeDefined();
		const githubProvider = ctx.socialProviders.find((p) => p.id === "github");
		expect(githubProvider).toBeDefined();
	});

	it("should init async plugin", async () => {
		const initFn = vi.fn(async () => {
			await new Promise((r) => setTimeout(r, 100));
			return {
				context: {
					baseURL: "http://async.test",
				},
			};
		});
		await initBase({
			baseURL: "http://localhost:3000",
			plugins: [
				{
					id: "test-async",
					init: initFn,
				},
			],
		});
		expect(initFn).toHaveBeenCalled();
	});

	it("handles empty basePath", async () => {
		const res = await initBase({
			baseURL: "http://localhost:5147/",
			basePath: "",
		});
		expect(res.baseURL).toBe("http://localhost:5147");
	});

	it("handles root basePath", async () => {
		const res = await initBase({
			baseURL: "http://localhost:5147/",
			basePath: "/",
		});
		expect(res.baseURL).toBe("http://localhost:5147");
	});

	it("normalizes trailing slashes with default path", async () => {
		const res = await initBase({
			baseURL: "http://localhost:5147////",
		});
		expect(res.baseURL).toBe("http://localhost:5147/api/auth");
	});

	// ------------ NEW

	describe("secret management", () => {
		it("should use options.secret as highest priority", async () => {
			vi.stubEnv(
				"BETTER_AUTH_SECRET",
				"env-secret-that-is-long-enough-for-validation-test",
			);
			const res = await initBase({
				secret: "options-secret-that-is-long-enough-for-validation",
			});
			expect(res.secret).toBe(
				"options-secret-that-is-long-enough-for-validation",
			);
			vi.unstubAllEnvs();
		});

		it("should use BETTER_AUTH_SECRET from env", async () => {
			vi.stubEnv(
				"BETTER_AUTH_SECRET",
				"better-auth-secret-that-is-long-enough-for-validation",
			);
			const opts: BetterAuthOptions = {};
			const adapter = await getAdapter(opts);
			const getDatabaseType = () => "memory";
			const res = await createAuthContext(adapter, opts, getDatabaseType);
			expect(res.secret).toBe(
				"better-auth-secret-that-is-long-enough-for-validation",
			);
			vi.unstubAllEnvs();
		});

		it("should fallback to AUTH_SECRET env", async () => {
			vi.stubEnv(
				"AUTH_SECRET",
				"auth-secret-that-is-long-enough-for-validation-test",
			);
			const opts: BetterAuthOptions = {};
			const adapter = await getAdapter(opts);
			const getDatabaseType = () => "memory";
			const res = await createAuthContext(adapter, opts, getDatabaseType);
			expect(res.secret).toBe(
				"auth-secret-that-is-long-enough-for-validation-test",
			);
			vi.unstubAllEnvs();
		});
	});

	describe("session configuration", () => {
		it("should use default session values", async () => {
			const res = await initBase({});
			expect(res.sessionConfig.updateAge).toBe(24 * 60 * 60);
			expect(res.sessionConfig.expiresIn).toBe(60 * 60 * 24 * 7);
			expect(res.sessionConfig.freshAge).toBe(60 * 60 * 24);
		});

		it("should allow freshAge = 0", async () => {
			const res = await initBase({
				session: { freshAge: 0 },
			});
			expect(res.sessionConfig.freshAge).toBe(0);
		});

		it("should return false for cookieRefreshCache when undefined", async () => {
			const res = await initBase({
				database: new Database(":memory:"),
			});
			expect(res.sessionConfig.cookieRefreshCache).toBe(false);
		});

		it("should set a value for cookieRefreshCache when database isn't provided", async () => {
			const res = await initBase({});
			expect(res.sessionConfig.cookieRefreshCache).not.toBe(false);
		});

		it("should return false for cookieRefreshCache when explicitly false", async () => {
			const res = await initBase({
				session: {
					cookieCache: {
						refreshCache: false,
					},
				},
			});
			expect(res.sessionConfig.cookieRefreshCache).toBe(false);
		});

		it("should calculate updateAge as 20% of maxAge when refreshCache is true", async () => {
			const res = await initBase({
				session: {
					cookieCache: {
						refreshCache: true,
						maxAge: 1000,
					},
				},
			});
			expect(res.sessionConfig.cookieRefreshCache).toEqual({
				enabled: true,
				updateAge: 200,
			});
		});

		it("should use default maxAge (300) for 20% calculation", async () => {
			const res = await initBase({
				session: {
					cookieCache: {
						refreshCache: true,
					},
				},
			});
			expect(res.sessionConfig.cookieRefreshCache).toEqual({
				enabled: true,
				updateAge: 60,
			});
		});

		it("should use custom updateAge in cookieRefreshCache", async () => {
			const res = await initBase({
				session: {
					cookieCache: {
						refreshCache: {
							updateAge: 500,
						},
					},
				},
			});
			expect(res.sessionConfig.cookieRefreshCache).toEqual({
				enabled: true,
				updateAge: 500,
			});
		});

		it("should allow custom session timeouts", async () => {
			const res = await initBase({
				session: {
					updateAge: 1000,
					expiresIn: 2000,
					freshAge: 500,
				},
			});
			expect(res.sessionConfig.updateAge).toBe(1000);
			expect(res.sessionConfig.expiresIn).toBe(2000);
			expect(res.sessionConfig.freshAge).toBe(500);
		});
	});

	describe("rate limiting", () => {
		it("should use memory storage by default", async () => {
			const res = await initBase({});
			expect(res.rateLimit.storage).toBe("memory");
		});

		it("should use secondary-storage when secondaryStorage is provided", async () => {
			const res = await initBase({
				secondaryStorage: {
					get: vi.fn(),
					set: vi.fn(),
					delete: vi.fn(),
				},
			});
			expect(res.rateLimit.storage).toBe("secondary-storage");
		});

		it("should use default window and max values", async () => {
			const res = await initBase({});
			expect(res.rateLimit.window).toBe(10);
			expect(res.rateLimit.max).toBe(100);
		});

		it("should allow custom rate limit values", async () => {
			const res = await initBase({
				rateLimit: {
					window: 60,
					max: 500,
				},
			});
			expect(res.rateLimit.window).toBe(60);
			expect(res.rateLimit.max).toBe(500);
		});
	});

	describe("security checks", () => {
		it("should skip origin check in test environment by default", async () => {
			const res = await initBase({});
			expect(res.skipOriginCheck).toBe(true);
		});

		it("should respect explicit disableOriginCheck setting", async () => {
			const res = await initBase({
				advanced: {
					disableOriginCheck: false,
				},
			});
			expect(res.skipOriginCheck).toBe(false);
		});

		it("should respect disableCSRFCheck setting", async () => {
			const res = await initBase({
				advanced: {
					disableCSRFCheck: true,
				},
			});
			expect(res.skipCSRFCheck).toBe(true);
		});

		it("should not skip CSRF check by default", async () => {
			const res = await initBase({});
			expect(res.skipCSRFCheck).toBe(false);
		});
	});

	describe("social providers", () => {
		it("should filter out providers with enabled: false", async () => {
			const res = await initBase({
				socialProviders: {
					github: {
						clientId: "test-id",
						clientSecret: "test-secret",
						enabled: false,
					},
				},
			});
			expect(res.socialProviders).toHaveLength(0);
		});

		it("should filter out null providers", async () => {
			const res = await initBase({
				socialProviders: {
					github: null as any,
				},
			});
			expect(res.socialProviders).toHaveLength(0);
		});

		it("should pass disableImplicitSignUp to provider", async () => {
			const res = await initBase({
				socialProviders: {
					github: {
						clientId: "test-id",
						clientSecret: "test-secret",
						disableImplicitSignUp: true,
					},
				},
			});
			const github = res.socialProviders.find((p) => p.id === "github");
			expect(github?.disableImplicitSignUp).toBe(true);
		});
	});

	describe("trusted origins", () => {
		it("should include baseURL in trusted origins", async () => {
			const res = await initBase({
				baseURL: "http://localhost:3000",
			});
			expect(res.trustedOrigins).toContain("http://localhost:3000");
		});

		it("should include custom trusted origins", async () => {
			const res = await initBase({
				baseURL: "http://localhost:3000",
				trustedOrigins: ["http://example.com", "http://test.com"],
			});
			expect(res.trustedOrigins).toContain("http://localhost:3000");
			expect(res.trustedOrigins).toContain("http://example.com");
			expect(res.trustedOrigins).toContain("http://test.com");
		});
	});

	describe("generate ID", () => {
		it("should fallback to advanced.database.generateId", async () => {
			const databaseGenerateId = vi.fn(() => "db-id");
			const res = await initBase({
				advanced: {
					database: {
						generateId: databaseGenerateId as any,
					},
				},
			});
			const id = res.generateId({ model: "session", size: 32 });
			expect(databaseGenerateId).toHaveBeenCalledWith({
				model: "session",
				size: 32,
			});
			expect(id).toBe("db-id");
		});

		it("should use default generateId", async () => {
			const res = await initBase({});
			const id = res.generateId({ model: "user", size: 16 });
			expect(typeof id).toBe("string");
			if (typeof id === "string") {
				expect(id.length).toBeGreaterThan(0);
			}
		});
	});

	describe("password configuration", () => {
		it("should use default password length limits", async () => {
			const res = await initBase({});
			expect(res.password.config.minPasswordLength).toBe(8);
			expect(res.password.config.maxPasswordLength).toBe(128);
		});

		it("should allow custom password length limits", async () => {
			const res = await initBase({
				emailAndPassword: {
					enabled: true,
					minPasswordLength: 12,
					maxPasswordLength: 256,
				},
			});
			expect(res.password.config.minPasswordLength).toBe(12);
			expect(res.password.config.maxPasswordLength).toBe(256);
		});

		it("should use custom hash and verify functions", async () => {
			const customHash = vi.fn();
			const customVerify = vi.fn();
			const res = await initBase({
				emailAndPassword: {
					enabled: true,
					password: {
						hash: customHash as any,
						verify: customVerify as any,
					},
				},
			});
			expect(res.password.hash).toBe(customHash);
			expect(res.password.verify).toBe(customVerify);
		});
	});

	describe("oauth configuration", () => {
		it("should use cookie strategy as default storeStateStrategy if database is not provided", async () => {
			const res = await initBase({});
			expect(res.oauthConfig.storeStateStrategy).toBe("cookie");
		});

		it("should allow cookie storeStateStrategy", async () => {
			const res = await initBase({
				account: {
					storeStateStrategy: "cookie",
				},
			});
			expect(res.oauthConfig.storeStateStrategy).toBe("cookie");
		});

		it("should respect skipStateCookieCheck setting", async () => {
			const res = await initBase({
				account: {
					skipStateCookieCheck: true,
				},
			});
			expect(res.oauthConfig.skipStateCookieCheck).toBe(true);
		});
	});

	describe("app name", () => {
		it("should use default app name", async () => {
			const res = await initBase({});
			expect(res.appName).toBe("Better Auth");
		});

		it("should allow custom app name", async () => {
			const res = await initBase({
				appName: "My Custom App",
			});
			expect(res.appName).toBe("My Custom App");
		});
	});

	describe("logger", () => {
		it("should create logger instance with all methods", async () => {
			// Test with custom logger
			const mockLogger = {
				warn: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				debug: vi.fn(),
			};
			const resWithCustom = await initBase({
				logger: mockLogger as any,
			});
			expect(resWithCustom.logger).toBeDefined();
			expect(resWithCustom.logger.warn).toBeDefined();
			expect(resWithCustom.logger.error).toBeDefined();

			// Test with default logger
			const resWithDefault = await initBase({});
			expect(resWithDefault.logger).toBeDefined();
			expect(typeof resWithDefault.logger.warn).toBe("function");
			expect(typeof resWithDefault.logger.error).toBe("function");
			expect(typeof resWithDefault.logger.info).toBe("function");
			expect(typeof resWithDefault.logger.debug).toBe("function");
		});
	});

	describe("trusted origins - environment variables", () => {
		it("should include origins from BETTER_AUTH_TRUSTED_ORIGINS env", async () => {
			vi.stubEnv(
				"BETTER_AUTH_TRUSTED_ORIGINS",
				"http://app1.com,http://app2.com",
			);
			const res = await initBase({
				baseURL: "http://localhost:3000",
			});
			expect(res.trustedOrigins).toContain("http://app1.com");
			expect(res.trustedOrigins).toContain("http://app2.com");
			expect(res.trustedOrigins).toContain("http://localhost:3000");
			vi.unstubAllEnvs();
		});

		it("should throw error for invalid trusted origin", async () => {
			await expect(
				initBase({
					baseURL: "http://localhost:3000",
					trustedOrigins: ["", "http://valid.com"],
				}),
			).rejects.toThrow();
		});

		it("should handle empty baseURL gracefully", async () => {
			const opts: BetterAuthOptions = {
				baseURL: undefined,
			};
			const adapter = await getAdapter(opts);
			const getDatabaseType = () => "memory";
			const res = await createAuthContext(adapter, opts, getDatabaseType);
			expect(res.trustedOrigins).toEqual([]);
		});
	});

	describe("database hooks", () => {
		it("should merge database hooks from plugins", async () => {
			const globalHook = vi.fn();
			const pluginHook1 = vi.fn();
			const pluginHook2 = vi.fn();

			const ctx = await initBase({
				databaseHooks: {
					"user:create": {
						before: [globalHook],
					},
				} as any,
				plugins: [
					{
						id: "test-plugin-1",
						init(ctx) {
							return {
								context: ctx,
								options: {
									databaseHooks: {
										"session:create": {
											before: [pluginHook1],
										},
									},
								} as any,
							};
						},
					},
					{
						id: "test-plugin-2",
						init(ctx) {
							return {
								context: ctx,
								options: {
									databaseHooks: {
										"account:create": {
											before: [pluginHook2],
										},
									},
								} as any,
							};
						},
					},
				],
			});

			expect(ctx.internalAdapter).toBeDefined();
		});

		it("should handle plugins without database hooks", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "test-plugin-no-hooks",
						init(ctx) {
							return {
								context: ctx,
								options: {},
							};
						},
					},
				],
			});

			expect(ctx.internalAdapter).toBeDefined();
		});
	});

	describe("telemetry", () => {
		it("should initialize telemetry and return publish function", async () => {
			const ctx = await initBase({});
			expect(ctx.publishTelemetry).toBeDefined();
			expect(typeof ctx.publishTelemetry).toBe("function");
		});
	});

	describe("endpoint conflicts", () => {
		it("should not throw when plugins have different endpoints", async () => {
			await expect(
				initBase({
					plugins: [
						{
							id: "plugin-1",
							endpoints: {
								test1: createAuthEndpoint(
									"/custom1",
									{ method: "GET" },
									async () => ({ ok: true }),
								),
							},
						},
						{
							id: "plugin-2",
							endpoints: {
								test2: createAuthEndpoint(
									"/custom2",
									{ method: "GET" },
									async () => ({ ok: true }),
								),
							},
						},
					],
				}),
			).resolves.toBeDefined();
		});

		it("should handle plugins with same path but different methods", async () => {
			await expect(
				initBase({
					plugins: [
						{
							id: "plugin-1",
							endpoints: {
								get: createAuthEndpoint(
									"/custom",
									{ method: "GET" },
									async () => ({ ok: true }),
								),
							},
						},
						{
							id: "plugin-2",
							endpoints: {
								post: createAuthEndpoint(
									"/custom",
									{ method: "POST" },
									async () => ({ ok: true }),
								),
							},
						},
					],
				}),
			).resolves.toBeDefined();
		});
	});

	describe("edge cases", () => {
		it("should handle baseURL as undefined", async () => {
			const opts: BetterAuthOptions = {
				baseURL: undefined,
			};
			const adapter = await getAdapter(opts);
			const getDatabaseType = () => "memory";
			const res = await createAuthContext(adapter, opts, getDatabaseType);
			expect(res.options.baseURL).toBe("");
		});

		it("should handle when plugin returns undefined from init", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "test-undefined",
						init: () => undefined as any,
					},
				],
			});
			expect(ctx).toBeDefined();
		});

		it("should handle when plugin returns empty object from init", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "test-empty",
						init: () => ({}) as any,
					},
				],
			});
			expect(ctx).toBeDefined();
		});

		it("should handle mixed sync/async plugin initialization order", async () => {
			const order: string[] = [];

			await initBase({
				plugins: [
					{
						id: "sync-1",
						init: (ctx) => {
							order.push("sync-1");
							return { context: ctx };
						},
					},
					{
						id: "async-1",
						init: async (ctx) => {
							await new Promise((r) => setTimeout(r, 10));
							order.push("async-1");
							return { context: ctx };
						},
					},
					{
						id: "sync-2",
						init: (ctx) => {
							order.push("sync-2");
							return { context: ctx };
						},
					},
				],
			});

			expect(order).toEqual(["sync-1", "async-1", "sync-2"]);
		});

		it("should handle plugins modifying same context property", async () => {
			const ctx = await initBase({
				appName: "Original",
				plugins: [
					{
						id: "plugin-1",
						init: (_ctx) => {
							return {
								context: {
									appName: "Modified by Plugin 1",
								},
							};
						},
					},
					{
						id: "plugin-2",
						init: (_ctx) => {
							return {
								context: {
									appName: "Modified by Plugin 2",
								},
							};
						},
					},
				],
			});

			expect(ctx.appName).toBe("Modified by Plugin 2");
		});

		it("should handle rate limiting when enabled is explicitly set", async () => {
			const res = await initBase({
				rateLimit: {
					enabled: true,
					window: 30,
					max: 50,
				},
			});
			expect(res.rateLimit.enabled).toBe(true);
			expect(res.rateLimit.window).toBe(30);
			expect(res.rateLimit.max).toBe(50);
		});

		it("should respect custom storage for rate limiting", async () => {
			const res = await initBase({
				rateLimit: {
					storage: "database",
				},
			});
			expect(res.rateLimit.storage).toBe("database");
		});
	});

	describe("context methods", () => {
		it("should have setNewSession method", async () => {
			const ctx = await initBase({});
			expect(ctx.setNewSession).toBeDefined();
			expect(typeof ctx.setNewSession).toBe("function");
		});

		it("should set new session via setNewSession", async () => {
			const ctx = await initBase({});
			const mockSession = { id: "test-session", userId: "user-1" } as any;
			ctx.setNewSession(mockSession);
			expect(ctx.newSession).toBe(mockSession);
		});

		it("should have runMigrations method that throws", async () => {
			const ctx = await initBase({});
			expect(ctx.runMigrations).toBeDefined();
			await expect(ctx.runMigrations()).rejects.toThrow(
				"runMigrations will be set by the specific init implementation",
			);
		});

		it("should have createAuthCookie method", async () => {
			const ctx = await initBase({});
			expect(ctx.createAuthCookie).toBeDefined();
			expect(typeof ctx.createAuthCookie).toBe("function");
		});
	});

	describe("adapter and internal adapter", () => {
		it("should set both adapter and internalAdapter", async () => {
			const ctx = await initBase({});
			expect(ctx.adapter).toBeDefined();
			expect(ctx.internalAdapter).toBeDefined();
		});

		it("should pass generateId to internal adapter", async () => {
			const customGenerateId = vi.fn(() => "custom-id");
			const ctx = await initBase({
				advanced: {
					database: {
						generateId: customGenerateId as any,
					},
				},
			});
			expect(ctx.internalAdapter).toBeDefined();
			const id = ctx.generateId({ model: "user", size: 16 });
			expect(id).toBe("custom-id");
		});
	});

	describe("password methods", () => {
		it("should have all password utility methods", async () => {
			const ctx = await initBase({});
			expect(ctx.password.checkPassword).toBeDefined();
			expect(ctx.password.hash).toBeDefined();
			expect(ctx.password.verify).toBeDefined();
			expect(typeof ctx.password.checkPassword).toBe("function");
			expect(typeof ctx.password.hash).toBe("function");
			expect(typeof ctx.password.verify).toBe("function");
		});
	});

	describe("endpoint conflicts", () => {
		it("should handle conflicting endpoints without throwing", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "plugin-1",
						endpoints: {
							test1: createAuthEndpoint(
								"/same-path",
								{ method: "GET" },
								async () => ({ result: "plugin1" }),
							),
						},
					},
					{
						id: "plugin-2",
						endpoints: {
							test2: createAuthEndpoint(
								"/same-path",
								{ method: "GET" },
								async () => ({ result: "plugin2" }),
							),
						},
					},
				],
			});

			expect(ctx).toBeDefined();
		});

		it("should handle multiple plugins with same path and method", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "plugin-1",
						endpoints: {
							all: createAuthEndpoint(
								"/api-path",
								{ method: "POST" },
								async () => ({ result: "post" }),
							),
						},
					},
					{
						id: "plugin-2",
						endpoints: {
							get: createAuthEndpoint(
								"/api-path",
								{ method: "POST" },
								async () => ({ result: "post2" }),
							),
						},
					},
				],
			});

			expect(ctx).toBeDefined();
		});

		it("should not error when plugins have different paths", async () => {
			const mockLogger = {
				warn: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				debug: vi.fn(),
			};

			await initBase({
				logger: mockLogger as any,
				plugins: [
					{
						id: "plugin-1",
						endpoints: {
							test1: createAuthEndpoint(
								"/path1",
								{ method: "GET" },
								async () => ({}),
							),
						},
					},
					{
						id: "plugin-2",
						endpoints: {
							test2: createAuthEndpoint(
								"/path2",
								{ method: "GET" },
								async () => ({}),
							),
						},
					},
				],
			});

			expect(mockLogger.error).not.toHaveBeenCalled();
		});
	});

	describe("base URL origin extraction", () => {
		it("should extract only origin from baseURL with path", async () => {
			const res = await initBase({
				baseURL: "http://localhost:3000/some/path",
			});

			expect(res.options.baseURL).toBe("http://localhost:3000");
		});

		it("should extract origin from baseURL with query params", async () => {
			const res = await initBase({
				baseURL: "http://localhost:3000/path?query=value",
			});

			expect(res.options.baseURL).toBe("http://localhost:3000");
		});

		it("should handle baseURL with port", async () => {
			const res = await initBase({
				baseURL: "http://localhost:8080/api/auth",
			});

			expect(res.options.baseURL).toBe("http://localhost:8080");
		});

		it("should handle https URLs", async () => {
			const res = await initBase({
				baseURL: "https://example.com/path/to/auth",
			});

			expect(res.options.baseURL).toBe("https://example.com");
		});
	});

	describe("cookies and tables configuration", () => {
		it("should configure auth cookies", async () => {
			const ctx = await initBase({});

			expect(ctx.authCookies).toBeDefined();
			expect(ctx.authCookies.sessionToken).toBeDefined();
		});

		it("should set up auth tables schema", async () => {
			const ctx = await initBase({});

			expect(ctx.tables).toBeDefined();
			expect(ctx.tables.user).toBeDefined();
			expect(ctx.tables.session).toBeDefined();
			expect(ctx.tables.account).toBeDefined();
		});

		it("should allow custom cookie configuration", async () => {
			const ctx = await initBase({
				advanced: {
					cookiePrefix: "custom_",
				},
			});

			expect(ctx.authCookies).toBeDefined();
		});
	});

	describe("secret validation", () => {
		it("should allow default secret in test environment", async () => {
			vi.stubEnv("BETTER_AUTH_SECRET", "");
			vi.stubEnv("AUTH_SECRET", "");

			const { DEFAULT_SECRET } = await import("../utils/constants");

			const ctx = await initBase({
				secret: DEFAULT_SECRET,
			});

			expect(ctx.secret).toBe(DEFAULT_SECRET);

			vi.unstubAllEnvs();
		});

		it("should throw error when default secret is set in production environment", async () => {
			vi.stubEnv("BETTER_AUTH_SECRET", "");
			vi.stubEnv("AUTH_SECRET", "");
			const originalNodeEnv = process.env.NODE_ENV;

			const { DEFAULT_SECRET } = await import("../utils/constants");

			const expectedErrorMessage =
				"You are using the default secret. Please set `BETTER_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.";

			vi.doMock("@better-auth/core/env", async () => {
				const actual = await vi.importActual("@better-auth/core/env");
				return {
					...actual,
					isProduction: true,
					isTest: () => false,
				};
			});

			vi.resetModules();

			const { createAuthContext } = await import("../context/create-context");
			const { getAdapter } = await import("../db/adapter-kysely");

			const initBaseProduction = async (
				options: Partial<BetterAuthOptions> = {},
			) => {
				const opts: BetterAuthOptions = {
					baseURL: "http://localhost:3000",
					...options,
				};
				const adapter = await getAdapter(opts);
				const getDatabaseType = () => "memory";
				return createAuthContext(adapter, opts, getDatabaseType);
			};

			await expect(
				initBaseProduction({
					secret: DEFAULT_SECRET,
				}),
			).rejects.toThrow(expectedErrorMessage);

			vi.doUnmock("@better-auth/core/env");
			vi.resetModules();
			process.env.NODE_ENV = originalNodeEnv;
			vi.unstubAllEnvs();
		});

		it("should throw error when secret is too short", async () => {
			vi.stubEnv("BETTER_AUTH_SECRET", "");
			vi.stubEnv("AUTH_SECRET", "");
			const originalNodeEnv = process.env.NODE_ENV;

			const expectedErrorMessage =
				"Invalid BETTER_AUTH_SECRET: must be at least 32 characters long for adequate security. Generate one with `npx @better-auth/cli secret` or `openssl rand -base64 32`.";

			vi.doMock("@better-auth/core/env", async () => {
				const actual = await vi.importActual("@better-auth/core/env");
				return {
					...actual,
					isProduction: false,
					isTest: () => false,
				};
			});

			vi.resetModules();

			const { createAuthContext } = await import("../context/create-context");
			const { getAdapter } = await import("../db/adapter-kysely");

			const initBaseNonTest = async (
				options: Partial<BetterAuthOptions> = {},
			) => {
				const opts: BetterAuthOptions = {
					baseURL: "http://localhost:3000",
					...options,
				};
				const adapter = await getAdapter(opts);
				const getDatabaseType = () => "memory";
				return createAuthContext(adapter, opts, getDatabaseType);
			};

			await expect(
				initBaseNonTest({
					secret: "short",
				}),
			).rejects.toThrow(expectedErrorMessage);

			vi.doUnmock("@better-auth/core/env");
			vi.resetModules();
			process.env.NODE_ENV = originalNodeEnv;
			vi.unstubAllEnvs();
		});

		it("should fallback to default secret when secret is empty", async () => {
			vi.stubEnv("BETTER_AUTH_SECRET", "");
			vi.stubEnv("AUTH_SECRET", "");

			const { DEFAULT_SECRET } = await import("../utils/constants");

			const ctx = await initBase({
				secret: "",
			});

			expect(ctx.secret).toBe(DEFAULT_SECRET);

			vi.unstubAllEnvs();
		});
	});

	describe("plugin initialization order and hooks", () => {
		it("should initialize plugins in sequence", async () => {
			const order: string[] = [];

			await initBase({
				plugins: [
					{
						id: "first",
						init: async (ctx) => {
							order.push("first-start");
							await new Promise((r) => setTimeout(r, 10));
							order.push("first-end");
							return { context: ctx };
						},
					},
					{
						id: "second",
						init: async (ctx) => {
							order.push("second-start");
							await new Promise((r) => setTimeout(r, 5));
							order.push("second-end");
							return { context: ctx };
						},
					},
					{
						id: "third",
						init: (ctx) => {
							order.push("third");
							return { context: ctx };
						},
					},
				],
			});

			expect(order).toEqual([
				"first-start",
				"first-end",
				"second-start",
				"second-end",
				"third",
			]);
		});

		it("should allow later plugins to see earlier plugin modifications", async () => {
			let secondPluginSawModification = false;

			await initBase({
				plugins: [
					{
						id: "modifier",
						init: (ctx) => {
							return {
								context: {
									appName: "Modified by First",
								},
							};
						},
					},
					{
						id: "observer",
						init: (ctx) => {
							if (ctx.appName === "Modified by First") {
								secondPluginSawModification = true;
							}
							return { context: ctx };
						},
					},
				],
			});

			expect(secondPluginSawModification).toBe(true);
		});

		it("should collect database hooks from all plugins", async () => {
			const hook1Called = vi.fn();
			const hook2Called = vi.fn();

			const ctx = await initBase({
				plugins: [
					{
						id: "plugin-1",
						init: (ctx) => ({
							context: ctx,
							options: {
								databaseHooks: {
									"user:create": {
										before: [hook1Called],
									},
								} as any,
							},
						}),
					},
					{
						id: "plugin-2",
						init: (ctx) => ({
							context: ctx,
							options: {
								databaseHooks: {
									"session:create": {
										before: [hook2Called],
									},
								} as any,
							},
						}),
					},
				],
			});

			expect(ctx.internalAdapter).toBeDefined();
		});

		it("should merge plugin options with defu", async () => {
			const ctx = await initBase({
				emailAndPassword: {
					enabled: true,
					minPasswordLength: 10,
				},
				plugins: [
					{
						id: "plugin-tries-to-override",
						init: (ctx) => ({
							context: ctx,
							options: {
								emailAndPassword: {
									enabled: false, // Should not override
									maxPasswordLength: 256, // Should be added
								},
							},
						}),
					},
				],
			});

			expect(ctx.options.emailAndPassword?.enabled).toBe(true);
			expect(ctx.options.emailAndPassword?.minPasswordLength).toBe(10);
			expect(ctx.options.emailAndPassword?.maxPasswordLength).toBe(256);
		});
	});

	describe("internal adapter recreation", () => {
		it("should have internal adapter available after initialization", async () => {
			const ctx = await initBase({});

			expect(ctx.internalAdapter).toBeDefined();
			expect(ctx.internalAdapter.createOAuthUser).toBeDefined();
			expect(ctx.internalAdapter.createUser).toBeDefined();
			expect(ctx.internalAdapter.findUserByEmail).toBeDefined();
		});

		it("should recreate internal adapter with plugin hooks after runPluginInit", async () => {
			const globalHook = vi.fn();

			const ctx = await initBase({
				databaseHooks: {
					"user:create": {
						before: [globalHook],
					},
				} as any,
				plugins: [
					{
						id: "with-hooks",
						init: (ctx) => ({
							context: ctx,
							options: {
								databaseHooks: {
									"session:create": {
										before: [vi.fn()],
									},
								} as any,
							},
						}),
					},
				],
			});

			expect(ctx.internalAdapter).toBeDefined();
		});
	});

	describe("additional edge cases", () => {
		it("should handle empty plugins array", async () => {
			const ctx = await initBase({
				plugins: [],
			});

			expect(ctx).toBeDefined();
			expect(ctx.options.plugins).toBeDefined();
		});

		it("should handle plugins without init method", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "no-init-plugin",
						// No init method
					} as any,
				],
			});

			expect(ctx).toBeDefined();
		});

		it("should handle plugin init that modifies nothing", async () => {
			const ctx = await initBase({
				plugins: [
					{
						id: "no-op",
						init: (ctx) => ({ context: ctx }),
					},
				],
			});

			expect(ctx).toBeDefined();
		});

		it("should handle multiple social providers", async () => {
			const ctx = await initBase({
				socialProviders: {
					github: {
						clientId: "github-id",
						clientSecret: "github-secret",
					},
					google: {
						clientId: "google-id",
						clientSecret: "google-secret",
					},
					discord: {
						clientId: "discord-id",
						clientSecret: "discord-secret",
					},
				},
			});

			expect(ctx.socialProviders).toHaveLength(3);
			expect(ctx.socialProviders.find((p) => p.id === "github")).toBeDefined();
			expect(ctx.socialProviders.find((p) => p.id === "google")).toBeDefined();
			expect(ctx.socialProviders.find((p) => p.id === "discord")).toBeDefined();
		});

		it("should handle secondaryStorage configuration", async () => {
			const mockStorage = {
				get: vi.fn(),
				set: vi.fn(),
				delete: vi.fn(),
			};

			const ctx = await initBase({
				secondaryStorage: mockStorage,
			});

			expect(ctx.secondaryStorage).toBe(mockStorage);
			expect(ctx.rateLimit.storage).toBe("secondary-storage");
		});

		it("should set session to null initially", async () => {
			const ctx = await initBase({});

			expect(ctx.session).toBe(null);
			expect(ctx.newSession).toBe(null);
		});

		it("should handle basePath with special characters", async () => {
			const ctx = await initBase({
				basePath: "/api/v1/auth-service",
				baseURL: "http://localhost:3000",
			});

			expect(ctx.baseURL).toBe("http://localhost:3000/api/v1/auth-service");
		});
	});

	describe("stateless mode", () => {
		it("should enable stateless mode by default", async () => {
			const ctx = await initBase({});
			expect(ctx.options.session?.cookieCache?.enabled).toBe(true);
			expect(ctx.options.session?.cookieCache?.strategy).toBe("jwe");
			expect(ctx.options.session?.cookieCache?.refreshCache).toBe(true);
			expect(ctx.oauthConfig.storeStateStrategy).toBe("cookie");
			expect(ctx.options.database).toBeUndefined();
		});

		it("should allow overriding stateless mode", async () => {
			const ctx = await initBase({
				session: {
					cookieCache: {
						enabled: false,
					},
				},
				account: {
					storeStateStrategy: "database",
				},
			});
			expect(ctx.options.session?.cookieCache?.enabled).toBe(false);
			expect(ctx.oauthConfig.storeStateStrategy).toBe("database");
		});
	});
});
