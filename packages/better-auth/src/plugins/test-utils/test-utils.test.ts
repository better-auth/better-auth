import { beforeEach, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "../admin";
import { emailOTP } from "../email-otp";
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

	describe("with admin plugin", async () => {
		const { auth } = await getTestInstance({
			plugins: [testUtils(), admin()],
		});
		const test = (await auth.$context).test;

		it("should work alongside admin plugin", () => {
			expect(test.createUser).toBeDefined();
			expect(test.saveUser).toBeDefined();
			expect(test.deleteUser).toBeDefined();
		});

		it("should save user with default admin role", async () => {
			const user = test.createUser({
				email: `test-admin-${Date.now()}@example.com`,
			});
			const savedUser = await test.saveUser(user);

			expect(savedUser.id).toBe(user.id);
			expect((savedUser as Record<string, unknown>).role).toBe("user");

			// Cleanup
			await test.deleteUser(user.id);
		});

		it("should allow setting custom role via admin API", async () => {
			const adminUser = test.createUser({
				email: `admin-user-${Date.now()}@example.com`,
				role: "admin",
			});
			await test.saveUser(adminUser);

			const regularUser = test.createUser({
				email: `regular-user-${Date.now()}@example.com`,
			});
			await test.saveUser(regularUser);

			// Login as admin and set role
			const { headers } = await test.login({ userId: adminUser.id });
			await auth.api.setRole({
				headers,
				body: { userId: regularUser.id, role: "admin" },
			});

			// Verify role was updated
			const updatedUser = await auth.api.getUser({
				headers,
				query: { id: regularUser.id },
			});
			expect(updatedUser?.role).toBe("admin");

			// Cleanup
			await test.deleteUser(adminUser.id);
			await test.deleteUser(regularUser.id);
		});

		it("should support ban/unban operations", async () => {
			const adminUser = test.createUser({
				email: `ban-admin-${Date.now()}@example.com`,
				role: "admin",
			});
			await test.saveUser(adminUser);

			const targetUser = test.createUser({
				email: `ban-target-${Date.now()}@example.com`,
			});
			await test.saveUser(targetUser);

			const { headers } = await test.login({ userId: adminUser.id });

			// Ban user
			await auth.api.banUser({
				headers,
				body: { userId: targetUser.id },
			});

			const bannedUser = await auth.api.getUser({
				headers,
				query: { id: targetUser.id },
			});
			expect(bannedUser?.banned).toBe(true);

			// Unban user
			await auth.api.unbanUser({
				headers,
				body: { userId: targetUser.id },
			});

			const unbannedUser = await auth.api.getUser({
				headers,
				query: { id: targetUser.id },
			});
			expect(unbannedUser?.banned).toBe(false);

			// Cleanup
			await test.deleteUser(adminUser.id);
			await test.deleteUser(targetUser.id);
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
