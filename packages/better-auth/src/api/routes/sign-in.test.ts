import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";

/**
 * More test can be found in `session.test.ts`
 */
describe("sign-in", async () => {
	const { auth, testUser, cookieSetter } = await getTestInstance();

	it("should return a response with a set-cookie header", async () => {
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const setCookie = signInRes.headers.get("set-cookie");
		const parsed = parseSetCookieHeader(setCookie || "");
		expect(parsed.get("better-auth.session_token")).toBeDefined();
	});

	it("should read the ip address and user agent from the headers", async () => {
		const headerObj = {
			"X-Forwarded-For": "127.0.0.1",
			"User-Agent": "Test",
		};
		const headers = new Headers(headerObj);
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
			headers,
		});
		cookieSetter(headers)({
			response: signInRes,
		});
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.session.ipAddress).toBe(headerObj["X-Forwarded-For"]);
		expect(session?.session.userAgent).toBe(headerObj["User-Agent"]);
	});

	it("verification email will be sent if sendOnSignIn is enabled", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailVerification: {
				sendOnSignIn: true,
				sendVerificationEmail,
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
		});

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
	});

	it("verification email will not be sent if sendOnSignIn is disabled", async () => {
		const sendVerificationEmail = vi.fn();
		const { auth, testUser } = await getTestInstance({
			emailVerification: {
				sendOnSignIn: false,
				sendVerificationEmail,
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: true,
			},
		});

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			}),
		).rejects.toThrowError(
			APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED),
		);

		expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
	});
});

describe("url checks", async () => {
	it("should reject untrusted origins", async () => {
		const { client } = await getTestInstance({
			advanced: {
				disableOriginCheck: false,
			},
		});
		const res = await client.signIn.social({
			provider: "google",
			callbackURL: "http://malicious.com",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callbackURL");

		const errorCallbackRes = await client.signIn.social({
			provider: "google",
			errorCallbackURL: "http://malicious.com",
		});
		expect(errorCallbackRes.error?.status).toBe(403);
		expect(errorCallbackRes.error?.message).toBe("Invalid errorCallbackURL");

		const newUserCallbackRes = await client.signIn.social({
			provider: "google",
			newUserCallbackURL: "http://malicious.com",
		});
		expect(newUserCallbackRes.error?.status).toBe(403);
		expect(newUserCallbackRes.error?.message).toBe(
			"Invalid newUserCallbackURL",
		);
	});
});

describe("sign-in CSRF protection", async () => {
	const { auth, testUser } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000"],
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			disableCSRFCheck: false,
		},
	});

	it("should block cross-site navigation login attempts (no cookies)", async () => {
		const maliciousRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: JSON.stringify({
					email: "attacker@evil.com",
					password: "password123",
				}),
			},
		);

		const response = await auth.handler(maliciousRequest);
		expect(response.status).toBe(403);
		const error = await response.json();
		expect(error.message).toBe(
			BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED.message,
		);
	});

	it("should allow same-origin navigation login attempts", async () => {
		const legitimateRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(legitimateRequest);
		expect(response.status).not.toBe(403);
	});

	it("should allow fetch/XHR requests (cors mode)", async () => {
		const fetchRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "cors",
					"Sec-Fetch-Dest": "empty",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(fetchRequest);
		expect(response.status).not.toBe(403);
	});

	it("should use origin validation when cookies exist", async () => {
		const requestWithCookies = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: "some_cookie=value",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(requestWithCookies);
		// Should not be blocked by CSRF check since cookies exist - uses origin validation instead
		expect(response.status).not.toBe(403);
	});
});

describe("sign-in with additionalFields", async () => {
	const { auth } = await getTestInstance(
		{
			user: {
				additionalFields: {
					newField: {
						type: "string",
						required: false,
					},
					isAdmin: {
						type: "boolean",
						defaultValue: true,
						input: false,
					},
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should return additionalFields in signInEmail response", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "signin-additional@test.com",
				password: "password",
				name: "SignIn Test",
				newField: "signin-value",
			},
		});

		const res = await auth.api.signInEmail({
			body: {
				email: "signin-additional@test.com",
				password: "password",
			},
		});

		// additionalFields should be returned in API response
		expect(res.user).toBeDefined();
		expect(res.user.newField).toBe("signin-value");
		expect(res.user.isAdmin).toBe(true);
	});
});

describe("custom route inputs", async () => {
	it("should validate required sign-in route inputs and expose them to hooks", async () => {
		let seenTenantId: string | undefined;
		const plugin = {
			id: "route-input-test",
			routeInputs: {
				"/sign-in/email": {
					tenantId: {
						type: "string",
						required: true,
					},
				},
			},
			hooks: {
				before: [
					{
						matcher: (ctx) => ctx.path === "/sign-in/email",
						handler: createAuthMiddleware(async (ctx) => {
							seenTenantId = ctx.body.tenantId;
						}),
					},
				],
			},
		} satisfies BetterAuthPlugin;
		const { auth, testUser } = await getTestInstance({
			plugins: [plugin],
		});

		await expect(
			auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				} as any,
			}),
		).rejects.toThrow();

		await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
				tenantId: "tenant_123",
			},
		});
		expect(seenTenantId).toBe("tenant_123");
	});

	it("should not persist sign-up route-only inputs as user fields", async () => {
		let seenInviteCode: string | undefined;
		const plugin = {
			id: "route-input-sign-up-hook-test",
			hooks: {
				before: [
					{
						matcher: (ctx) => ctx.path === "/sign-up/email",
						handler: createAuthMiddleware(async (ctx) => {
							seenInviteCode = ctx.body.inviteCode;
						}),
					},
				],
			},
		} satisfies BetterAuthPlugin;
		const { auth } = await getTestInstance(
			{
				plugins: [plugin],
				routeInputs: {
					"/sign-up/email": {
						inviteCode: {
							type: "string",
							required: true,
						},
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		const res = await auth.api.signUpEmail({
			body: {
				email: "route-input-signup@test.com",
				password: "password",
				name: "Route Input",
				inviteCode: "invite-123",
			},
		});

		expect(seenInviteCode).toBe("invite-123");
		expect((res.user as any).inviteCode).toBeUndefined();
	});

	it("should reject route inputs that collide with endpoint body fields", async () => {
		await expect(
			getTestInstance({
				routeInputs: {
					"/sign-in/email": {
						email: {
							type: "string",
						},
					},
				},
			}),
		).rejects.toThrow(/conflicts with an existing endpoint body field/);
	});

	it("should reject duplicate route input fields", async () => {
		const plugin = {
			id: "duplicate-route-input-test",
			routeInputs: {
				"/sign-in/email": {
					tenantId: {
						type: "string",
					},
				},
			},
		} satisfies BetterAuthPlugin;
		await expect(
			getTestInstance({
				plugins: [plugin],
				routeInputs: {
					"/sign-in/email": {
						tenantId: {
							type: "string",
						},
					},
				},
			}),
		).rejects.toThrow(/Duplicate route input/);
	});

	it("should infer top-level and plugin route inputs on the client", async () => {
		const plugin = {
			id: "typed-route-input-test",
			routeInputs: {
				"/sign-in/email": {
					pluginCode: {
						type: "string",
					},
				},
			},
		} satisfies BetterAuthPlugin;
		const authOptions = {
			plugins: [plugin],
			routeInputs: {
				"/sign-in/email": {
					tenantId: {
						type: "string",
					},
					optionalCode: {
						type: "string",
						required: false,
					},
				},
			},
		} satisfies BetterAuthOptions;
		const client = createAuthClient<{
			$InferAuth: typeof authOptions;
			plugins: [
				{
					id: "typed-route-input-client-test";
					$InferServerPlugin: typeof plugin;
				},
			];
		}>({
			$InferAuth: {} as typeof authOptions,
			plugins: [
				{
					id: "typed-route-input-client-test",
					$InferServerPlugin: {} as typeof plugin,
				},
			],
		});
		type SignInInput = Parameters<typeof client.signIn.email>[0];
		expectTypeOf<SignInInput>().toMatchTypeOf<{
			tenantId: string;
			pluginCode: string;
			optionalCode?: string | null | undefined;
		}>();
		expectTypeOf<{
			email: string;
			password: string;
			tenantId: string;
			pluginCode: string;
			optionalCode?: string | null | undefined;
		}>().toMatchTypeOf<SignInInput>();
	});
});

describe("sign-in with form data", async () => {
	const { auth, testUser } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000"],
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			disableCSRFCheck: false,
		},
	});

	it("should accept form-urlencoded content type", async () => {
		const formRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: new URLSearchParams({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(formRequest);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.token).toBeDefined();
		expect(data.user.email).toBe(testUser.email);
	});

	it("should block cross-site form submissions", async () => {
		const maliciousFormRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: new URLSearchParams({
					email: "attacker@evil.com",
					password: "password123",
				}),
			},
		);

		const response = await auth.handler(maliciousFormRequest);
		expect(response.status).toBe(403);
		const error = await response.json();
		expect(error.message).toBe(
			BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED.message,
		);
	});

	it("should allow same-site form submissions from trusted origins", async () => {
		const formRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"Sec-Fetch-Site": "same-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: new URLSearchParams({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(formRequest);
		expect(response.status).toBe(200);
	});
});

describe("email case insensitivity", async () => {
	/**
	 * Tests that sign-in works regardless of email case, preventing
	 * "User not found" errors when users sign up with mixed case
	 * but sign in with different casing.
	 */
	it("should sign in with different email casing than sign-up", async () => {
		const { auth } = await getTestInstance();
		const mixedCaseEmail = "Test.User@Example.COM";
		const password = "securePassword123";

		await auth.api.signUpEmail({
			body: {
				email: mixedCaseEmail,
				password,
				name: "Test User",
			},
		});

		const signInLowercase = await auth.api.signInEmail({
			body: {
				email: mixedCaseEmail.toLowerCase(),
				password,
			},
		});
		expect(signInLowercase.user).toBeDefined();
		expect(signInLowercase.user.email).toBe(mixedCaseEmail.toLowerCase());

		const signInUppercase = await auth.api.signInEmail({
			body: {
				email: mixedCaseEmail.toUpperCase(),
				password,
			},
		});
		expect(signInUppercase.user).toBeDefined();
		expect(signInUppercase.user.email).toBe(mixedCaseEmail.toLowerCase());

		const signInOriginal = await auth.api.signInEmail({
			body: {
				email: mixedCaseEmail,
				password,
			},
		});
		expect(signInOriginal.user).toBeDefined();
		expect(signInOriginal.user.email).toBe(mixedCaseEmail.toLowerCase());
	});

	it("should store email as lowercase regardless of input casing", async () => {
		const { auth } = await getTestInstance();
		const mixedCaseEmail = "Another.User@DOMAIN.com";
		const password = "password123";

		const signUpResult = await auth.api.signUpEmail({
			body: {
				email: mixedCaseEmail,
				password,
				name: "Another User",
			},
		});

		expect(signUpResult.user.email).toBe(mixedCaseEmail.toLowerCase());
	});

	it("should not allow duplicate sign-ups with different email casing", async () => {
		const { auth } = await getTestInstance();
		const email = "duplicate.test@example.com";
		const password = "password123";

		await auth.api.signUpEmail({
			body: {
				email: email.toLowerCase(),
				password,
				name: "First User",
			},
		});

		await expect(
			auth.api.signUpEmail({
				body: {
					email: email.toUpperCase(),
					password,
					name: "Second User",
				},
			}),
		).rejects.toThrow();
	});
});
