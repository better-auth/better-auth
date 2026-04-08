import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { admin } from "../admin";

describe("Admin UI", async () => {
	const { auth, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				admin({
					bannedUserMessage: "Custom banned user message",
				}),
			],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							if (user.name === "Admin") {
								return {
									data: {
										...user,
										role: "admin",
									},
								};
							}
						},
					},
				},
			},
		},
		{
			testUser: {
				name: "Admin",
			},
		},
	);

	async function getAdminCookie() {
		const { headers } = await signInWithTestUser();
		return headers.get("cookie") || "";
	}

	it("should have a ui handler on the auth instance", () => {
		expect(auth.ui).toBeDefined();
		expect(auth.ui.handler).toBeTypeOf("function");
	});

	it("should return 401 for unauthenticated requests", async () => {
		const request = new Request("http://localhost:3000/auth/admin");
		const response = await auth.ui.handler(request);
		expect(response.status).toBe(401);
		const html = await response.text();
		expect(html).toContain("Sign in required");
	});

	it("should return the admin dashboard for authenticated admin", async () => {
		const cookie = await getAdminCookie();
		const request = new Request("http://localhost:3000/auth/admin", {
			headers: { cookie },
		});
		const response = await auth.ui.handler(request);
		expect(response.status).toBe(200);

		const html = await response.text();
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("Welcome Back");
		expect(html).toContain("Better Auth");
	});

	it("should return the users page", async () => {
		const cookie = await getAdminCookie();
		const request = new Request("http://localhost:3000/auth/admin/users", {
			headers: { cookie },
		});
		const response = await auth.ui.handler(request);
		expect(response.status).toBe(200);

		const html = await response.text();
		expect(html).toContain("Users");
		expect(html).toContain("ba-table");
	});

	it("should return HTML fragments for partial navigation", async () => {
		const cookie = await getAdminCookie();
		const request = new Request("http://localhost:3000/auth/admin/users", {
			headers: {
				cookie,
				"X-BA-Partial": "true",
			},
		});
		const response = await auth.ui.handler(request);
		expect(response.status).toBe(200);

		const html = await response.text();
		expect(html).not.toContain("<!DOCTYPE html>");
		expect(html).toContain("Users");
	});

	it("should return not found for unknown sub-routes", async () => {
		const cookie = await getAdminCookie();
		const request = new Request(
			"http://localhost:3000/auth/admin/nonexistent",
			{ headers: { cookie } },
		);
		const response = await auth.ui.handler(request);
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain("Not Found");
	});

	it("should include the thin client runtime and styles", async () => {
		const cookie = await getAdminCookie();
		const request = new Request("http://localhost:3000/auth/admin", {
			headers: { cookie },
		});
		const response = await auth.ui.handler(request);
		const html = await response.text();

		expect(html).toContain("<style>");
		expect(html).toContain("--ba-bg");
		expect(html).toContain("<script>");
		expect(html).toContain("ba-bottomnav");
	});

	it("should use radix-style dialog primitives for modals", async () => {
		const cookie = await getAdminCookie();
		const request = new Request("http://localhost:3000/auth/admin/users", {
			headers: { cookie },
		});
		const response = await auth.ui.handler(request);
		const html = await response.text();

		expect(html).toContain("data-ba-dialog=");
		expect(html).toContain("data-ba-dialog-trigger=");
		expect(html).toContain("data-ba-dialog-overlay");
		expect(html).toContain("data-ba-dialog-close");
	});

	it("should use data-action forms for mutations", async () => {
		const cookie = await getAdminCookie();
		const request = new Request("http://localhost:3000/auth/admin/users", {
			headers: { cookie },
		});
		const response = await auth.ui.handler(request);
		const html = await response.text();

		expect(html).toContain("data-action=");
		expect(html).toContain("/admin/create-user");
	});

	it("should disable UI when ui option is false", async () => {
		const { auth: authNoUi } = await getTestInstance({
			plugins: [
				admin({
					ui: false,
				}),
			],
		});

		const request = new Request("http://localhost:3000/auth/admin");
		const response = await authNoUi.ui.handler(request);
		expect(response.status).toBe(404);
	});
});
