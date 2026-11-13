import type { BetterAuthOptions } from "@better-auth/core";
import { beforeEach, describe, expect, it } from "vitest";
import { getCookieCache } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from "../email-otp";
import { organization } from "../organization";
import { testUtils } from "./index";
import type { TestHelpers } from "./types";

describe("testUtils plugin", async () => {
	describe("basic functionality", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils()],
		});
		const test = (await auth.$context).test;

		it("should expose test helpers on context", () => {
			expect(test).toBeDefined();
			expect(test.createUser).toBeDefined();
			expect(test.saveUser).toBeDefined();
			expect(test.deleteUser).toBeDefined();
			expect(test.login).toBeDefined();
			expect(test.getAuthHeaders).toBeDefined();
			expect(test.getCookies).toBeDefined();
		});

		it("should NOT expose organization helpers without organization plugin", () => {
			expect(test.createOrganization).toBeUndefined();
			expect(test.saveOrganization).toBeUndefined();
			expect(test.deleteOrganization).toBeUndefined();
			expect(test.addMember).toBeUndefined();
		});

		it("should NOT expose getOTP without captureOTP option", () => {
			expect(test.getOTP).toBeUndefined();
		});
	});

	describe("user factories", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils()],
		});
		const test = (await auth.$context).test;

		it("should create user with default values", () => {
			const user = test.createUser();

			expect(user.id).toBeDefined();
			expect(user.email).toMatch(/@example\.com$/);
			expect(user.name).toBe("Test User");
			expect(user.emailVerified).toBe(true);
			expect(user.createdAt).toBeInstanceOf(Date);
			expect(user.updatedAt).toBeInstanceOf(Date);
		});

		it("should create user with overrides", () => {
			const user = test.createUser({
				email: "custom@test.com",
				name: "Custom User",
				emailVerified: false,
			});

			expect(user.email).toBe("custom@test.com");
			expect(user.name).toBe("Custom User");
			expect(user.emailVerified).toBe(false);
		});

		it("should allow custom fields via overrides", () => {
			const user = test.createUser({
				email: "plugin@test.com",
				customField: "custom value",
			});

			expect(user.email).toBe("plugin@test.com");
			expect((user as Record<string, unknown>).customField).toBe(
				"custom value",
			);
		});
	});

	describe("database helpers", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils()],
		});
		const test = (await auth.$context).test;

		it("should save and delete user", async () => {
			const user = test.createUser({
				email: `test-save-${Date.now()}@example.com`,
			});

			// Save user
			const savedUser = await test.saveUser(user);
			expect(savedUser.id).toBe(user.id);
			expect(savedUser.email).toBe(user.email);

			// Verify user exists via getAuthHeaders
			const headers = await test.getAuthHeaders({ userId: user.id });
			expect(headers.get("cookie")).toContain("session_token");

			// Delete user
			await test.deleteUser(user.id);
		});
	});

	describe("auth helpers", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils()],
		});
		const test = (await auth.$context).test;

		it("should login and return session, user, headers, cookies, token", async () => {
			const user = test.createUser({
				email: `test-login-${Date.now()}@example.com`,
			});
			await test.saveUser(user);

			const result = await test.login({ userId: user.id });

			expect(result.session).toBeDefined();
			expect(result.session.userId).toBe(user.id);
			expect(result.session.token).toBeDefined();

			expect(result.user).toBeDefined();
			expect(result.user.id).toBe(user.id);

			expect(result.headers).toBeInstanceOf(Headers);
			expect(result.headers.get("cookie")).toContain("session_token");

			expect(result.cookies).toBeInstanceOf(Array);
			expect(result.cookies.length).toBeGreaterThan(0);
			expect(result.cookies[0]?.name).toContain("session_token");
			expect(result.cookies[0]?.value).toBeDefined();

			expect(result.token).toBe(result.session.token);

			// Cleanup
			await test.deleteUser(user.id);
		});

		it("should get auth headers for a user", async () => {
			const user = test.createUser({
				email: `test-headers-${Date.now()}@example.com`,
			});
			await test.saveUser(user);

			const headers = await test.getAuthHeaders({ userId: user.id });

			expect(headers).toBeInstanceOf(Headers);
			expect(headers.get("cookie")).toContain("session_token");

			// Verify headers work with API
			const session = await auth.api.getSession({ headers });
			expect(session?.user.id).toBe(user.id);

			// Cleanup
			await test.deleteUser(user.id);
		});

		it("should get cookies array for browser testing", async () => {
			const user = test.createUser({
				email: `test-cookies-${Date.now()}@example.com`,
			});
			await test.saveUser(user);

			const cookies = await test.getCookies({ userId: user.id });

			expect(cookies).toBeInstanceOf(Array);
			expect(cookies.length).toBeGreaterThan(0);

			const sessionCookie = cookies[0]!;
			expect(sessionCookie.name).toContain("session_token");
			expect(sessionCookie.value).toBeDefined();
			expect(sessionCookie.domain).toBeDefined();
			expect(sessionCookie.path).toBe("/");
			expect(sessionCookie.httpOnly).toBe(true);
			expect(sessionCookie.sameSite).toBe("Lax");

			// Cleanup
			await test.deleteUser(user.id);
		});

		it("should allow custom domain for cookies", async () => {
			const user = test.createUser({
				email: `test-domain-${Date.now()}@example.com`,
			});
			await test.saveUser(user);

			const cookies = await test.getCookies({
				userId: user.id,
				domain: "custom.example.com",
			});

			expect(cookies[0]?.domain).toBe("custom.example.com");

			// Cleanup
			await test.deleteUser(user.id);
		});
	});

	describe("additional session fields", async () => {
		const { auth } = await getTestInstance(
			{
				plugins: [
					testUtils(),
					{
						id: "session-fixture",
						schema: {
							session: {
								fields: {
									pluginToken: { type: "string", required: true, input: false },
								},
							},
						},
					},
				],
				session: {
					additionalFields: {
						providerToken: { type: "string", required: true, input: false },
						label: { type: "string", defaultValue: "default" },
					},
				},
			},
			{ disableTestUser: true },
		);
		const test = (await auth.$context).test;

		it.each(["login", "getAuthHeaders", "getCookies"] as const)(
			"%s persists required fields and overrides defaults before authenticating",
			async (helper) => {
				const user = await test.saveUser(test.createUser());
				const options = {
					userId: user.id,
					session: {
						providerToken: `token-${helper}`,
						pluginToken: `plugin-${helper}`,
						label: "",
					},
				};
				let headers: Headers;
				if (helper === "login") {
					const result = await test.login(options);
					expect(result.session).toMatchObject(options.session);
					headers = result.headers;
				} else if (helper === "getAuthHeaders") {
					headers = await test.getAuthHeaders(options);
				} else {
					const cookies = await test.getCookies(options);
					headers = new Headers({
						cookie: cookies
							.map(({ name, value }) => `${name}=${value}`)
							.join("; "),
					});
				}
				const session = await auth.api.getSession({ headers });
				expect(session?.user.id).toBe(user.id);
				expect(session?.session).toMatchObject(options.session);
				await test.deleteUser(user.id);
			},
		);

		it("keeps defaults for omitted fields and generates standard session fields", async () => {
			const user = await test.saveUser(test.createUser());
			const result = await test.login({
				userId: user.id,
				session: {
					providerToken: "fixture-token",
					pluginToken: "plugin-token",
					id: "supplied-id",
					userId: "another-user",
					token: "supplied-token",
					expiresAt: new Date(0),
					createdAt: new Date(0),
					updatedAt: new Date(0),
					ipAddress: "192.0.2.1",
					userAgent: "supplied-agent",
				},
			});
			expect(result.session).toMatchObject({
				userId: user.id,
				providerToken: "fixture-token",
				pluginToken: "plugin-token",
				label: "default",
				ipAddress: "",
				userAgent: "",
			});
			expect(result.session.id).not.toBe("supplied-id");
			expect(result.token).not.toBe("supplied-token");
			expect(result.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
			expect(result.session.createdAt.getTime()).toBeGreaterThan(0);
			expect(result.session.updatedAt.getTime()).toBeGreaterThan(0);
			const session = await auth.api.getSession({ headers: result.headers });
			expect(session?.user.id).toBe(user.id);
			await test.deleteUser(user.id);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9271
	 */
	describe("cookie cache authentication", async () => {
		describe.each(["compact", "jwt", "jwe"] as const)(
			"%s strategy",
			async (strategy) => {
				const options = {
					database: undefined,
					user: {
						additionalFields: {
							publicValue: { type: "string", defaultValue: "public-user" },
							privateValue: {
								type: "string",
								defaultValue: "private-user",
								returned: false,
							},
						},
					},
					session: {
						cookieCache: {
							enabled: true,
							strategy,
							version: "test-fixture-v2",
						},
						additionalFields: {
							publicValue: { type: "string", defaultValue: "public-session" },
							privateValue: {
								type: "string",
								defaultValue: "private-session",
								returned: false,
							},
						},
					},
					plugins: [testUtils()],
				} satisfies BetterAuthOptions;
				const { auth } = await getTestInstance(options, {
					disableTestUser: true,
				});
				const { auth: reader } = await getTestInstance(options, {
					disableTestUser: true,
				});
				const ctx = await auth.$context;
				const test = ctx.test;

				it.each(["login", "getAuthHeaders", "getCookies"] as const)(
					"%s authenticates a fresh stateless instance with the configured cache",
					async (helper) => {
						const user = await test.saveUser(test.createUser());
						let headers: Headers;
						if (helper === "login") {
							const result = await test.login({ userId: user.id });
							headers = result.headers;
							expect(result.cookies.map(({ name }) => name)).toContain(
								ctx.authCookies.sessionData.name,
							);
							expect(
								new Headers({
									cookie: result.cookies
										.map(({ name, value }) => `${name}=${value}`)
										.join("; "),
								}).get("cookie"),
							).toBe(headers.get("cookie"));
						} else if (helper === "getAuthHeaders") {
							headers = await test.getAuthHeaders({ userId: user.id });
						} else {
							const cookies = await test.getCookies({ userId: user.id });
							headers = new Headers({
								cookie: cookies
									.map(({ name, value }) => `${name}=${value}`)
									.join("; "),
							});
						}

						// The reader has its own empty fallback adapter, so only the cache
						// can authenticate these cookies.
						expect(reader.options.database).toBeUndefined();
						expect(
							await (await reader.$context).internalAdapter.findUserById(
								user.id,
							),
						).toBeNull();
						const session = await reader.api.getSession({ headers });
						expect(session?.user.id).toBe(user.id);
						expect(session?.user.publicValue).toBe("public-user");
						expect(session?.session.publicValue).toBe("public-session");

						const cache = await getCookieCache(headers, {
							secret: ctx.secret,
							strategy,
							version: "test-fixture-v2",
						});
						expect(cache).not.toBeNull();
						expect(cache?.user).not.toHaveProperty("privateValue");
						expect(cache?.session).not.toHaveProperty("privateValue");

						const tokenOnly = new Headers({
							cookie: headers
								.get("cookie")!
								.split("; ")
								.find((cookie) =>
									cookie.startsWith(`${ctx.authCookies.sessionToken.name}=`),
								)!,
						});
						expect(
							await reader.api.getSession({ headers: tokenOnly }),
						).toBeNull();
					},
				);
			},
		);

		it("emits chunked JWE cache cookies with the configured attributes", async () => {
			const options = {
				database: undefined,
				baseURL: "https://auth.example.com",
				session: {
					cookieCache: { enabled: true, strategy: "jwe", maxAge: 600 },
				},
				advanced: {
					cookiePrefix: "fixture",
					cookies: {
						session_data: {
							name: "custom-cache",
							attributes: {
								path: "/api/auth",
								sameSite: "strict",
								httpOnly: false,
							},
						},
					},
				},
				plugins: [testUtils()],
			} satisfies BetterAuthOptions;
			const { auth } = await getTestInstance(options, {
				disableTestUser: true,
			});
			const { auth: reader } = await getTestInstance(options, {
				disableTestUser: true,
			});
			const ctx = await auth.$context;
			const user = await ctx.test.saveUser(
				ctx.test.createUser({ name: "Long name ".repeat(1000) }),
			);
			const cookies = await ctx.test.getCookies({
				userId: user.id,
				domain: "browser.example.com",
			});
			const cacheCookies = cookies.filter(({ name }) =>
				name.startsWith(`${ctx.authCookies.sessionData.name}.`),
			);
			expect(cacheCookies.length).toBeGreaterThan(1);
			for (const cookie of cacheCookies) {
				expect(cookie).toMatchObject({
					domain: "browser.example.com",
					path: "/api/auth",
					httpOnly: false,
					secure: true,
					sameSite: "Strict",
				});
				expect(cookie.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
			}
			const headers = new Headers({
				cookie: cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
			});
			const session = await reader.api.getSession({ headers });
			expect(session?.user.name).toBe(user.name);
		});

		it("keeps token-only cookies when the cache is disabled", async () => {
			const { auth } = await getTestInstance({
				session: { cookieCache: { enabled: false } },
				plugins: [testUtils()],
			});
			const ctx = await auth.$context;
			const user = await ctx.test.saveUser(ctx.test.createUser());
			const result = await ctx.test.login({ userId: user.id });
			expect(result.cookies).toHaveLength(1);
			expect(result.cookies[0]?.name).toBe(ctx.authCookies.sessionToken.name);
			expect(result.headers.get("cookie")).not.toContain(
				ctx.authCookies.sessionData.name,
			);
			expect(
				(await auth.api.getSession({ headers: result.headers }))?.user.id,
			).toBe(user.id);
		});
	});

	describe("with organization plugin", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils(), organization()],
		});
		const test = (await auth.$context).test;

		it("should expose organization helpers", () => {
			expect(test.createOrganization).toBeDefined();
			expect(test.saveOrganization).toBeDefined();
			expect(test.deleteOrganization).toBeDefined();
			expect(test.addMember).toBeDefined();
		});

		it("should create organization with default values", () => {
			const org = test.createOrganization!();

			expect(org.id).toBeDefined();
			expect(org.name).toBe("Test Organization");
			expect(org.slug).toBeDefined();
			expect(org.createdAt).toBeInstanceOf(Date);
		});

		it("should create organization with overrides", () => {
			const org = test.createOrganization!({
				name: "Custom Org",
				slug: "custom-org",
			});

			expect(org.name).toBe("Custom Org");
			expect(org.slug).toBe("custom-org");
		});

		it("should save and delete organization", async () => {
			const user = test.createUser({
				email: `test-org-${Date.now()}@example.com`,
			});
			await test.saveUser(user);

			const org = test.createOrganization!({
				name: "Test Org for Delete",
			});
			const savedOrg = await test.saveOrganization!(org);

			expect(savedOrg.id).toBe(org.id);
			expect(savedOrg.name).toBe(org.name);

			// Delete organization (should cascade to members/invitations)
			await test.deleteOrganization!(org.id as string);

			// Cleanup
			await test.deleteUser(user.id);
		});

		it("should add member to organization", async () => {
			const user = test.createUser({
				email: `test-member-${Date.now()}@example.com`,
			});
			await test.saveUser(user);

			const org = test.createOrganization!();
			await test.saveOrganization!(org);

			const member = await test.addMember!({
				userId: user.id,
				organizationId: org.id as string,
				role: "admin",
			});

			expect(member.userId).toBe(user.id);
			expect(member.organizationId).toBe(org.id);
			expect(member.role).toBe("admin");

			// Cleanup
			await test.deleteOrganization!(org.id as string);
			await test.deleteUser(user.id);
		});
	});

	describe("OTP capture", async () => {
		// Inline getTestInstance here to preserve emailOTP plugin type inference
		const { auth } = await getTestInstance({
			plugins: [
				testUtils({ captureOTP: true }),
				emailOTP({
					async sendVerificationOTP({ email, otp }) {
						// Don't actually send email in tests
					},
				}),
			],
		});

		const ctx = (await auth.$context) as unknown as { test: TestHelpers };
		const test = ctx.test;

		beforeEach(() => {
			test.clearOTPs!();
		});

		it("should expose getOTP helper when captureOTP is true", () => {
			expect(test.getOTP).toBeDefined();
			expect(test.clearOTPs).toBeDefined();
		});

		it("should capture OTP when verification value is created", async () => {
			const email = `test-otp-${Date.now()}@example.com`;
			const user = test.createUser({ email });
			await test.saveUser(user);

			// Send OTP
			await auth.api.sendVerificationOTP({
				body: { email, type: "sign-in" },
			});

			// Get captured OTP
			const otp = test.getOTP!(email);
			expect(otp).toBeDefined();
			expect(otp).toMatch(/^\d{6}$/); // Default OTP is 6 digits

			// Cleanup
			await test.deleteUser(user.id);
		});
	});

	describe("integration test example", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils()],
		});
		const test = (await auth.$context).test;

		it("should work for authenticated request testing", async () => {
			// Create and save user
			const user = test.createUser({
				email: `integration-${Date.now()}@example.com`,
				name: "Integration Test User",
			});
			await test.saveUser(user);

			// Login and get headers
			const { headers } = await test.login({ userId: user.id });

			// Make authenticated request
			const session = await auth.api.getSession({ headers });
			expect(session?.user.id).toBe(user.id);
			expect(session?.user.name).toBe("Integration Test User");

			// Cleanup
			await test.deleteUser(user.id);
		});
	});
});
