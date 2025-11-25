import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import {
	isFormContentType,
	parseFormBody,
	convertFormRequestToJson,
} from "./parse-form-body";

describe("parseFormBody - Unit Tests", () => {
	it("should detect form content-type correctly", () => {
		expect(isFormContentType("application/x-www-form-urlencoded")).toBe(true);
		expect(
			isFormContentType("application/x-www-form-urlencoded; charset=utf-8"),
		).toBe(true);
		expect(isFormContentType("application/json")).toBe(false);
		expect(isFormContentType("text/plain")).toBe(false);
	});

	it("should parse email and password as strings", async () => {
		const body = new URLSearchParams({
			email: "user@example.com",
			password: "secret",
		}).toString();

		const req = new Request("http://localhost/test", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			body,
		});

		const result = await parseFormBody(req);

		expect(result.email).toBe("user@example.com");
		expect(result.password).toBe("secret");
		expect(typeof result.email).toBe("string");
		expect(typeof result.password).toBe("string");
	});

	it("should leave all fields as strings", async () => {
		const body = new URLSearchParams({
			email: "user@example.com",
			password: "secret",
			callbackURL: "http://localhost:3000",
			image: "https://example.com/avatar.png",
			flag: "true",
		}).toString();

		const req = new Request("http://localhost/test", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			body,
		});

		const result = await parseFormBody(req);

		expect(result.callbackURL).toBe("http://localhost:3000");
		expect(result.image).toBe("https://example.com/avatar.png");
		expect(result.flag).toBe("true");
		expect(typeof result.flag).toBe("string");
		expect(typeof result.callbackURL).toBe("string");
		expect(typeof result.image).toBe("string");
	});

	it("should convert form request to JSON with correct content-type", async () => {
		const body = new URLSearchParams({
			email: "user@example.com",
			password: "secret",
		}).toString();

		const req = new Request("http://localhost/test", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			body,
		});

		const convertedReq = await convertFormRequestToJson(req);

		expect(convertedReq.headers.get("content-type")).toBe("application/json");

		const jsonBody = await convertedReq.json();

		expect(jsonBody.email).toBe("user@example.com");
		expect(jsonBody.password).toBe("secret");
	});
});

describe("Form-based Authentication", async (it) => {
	const { auth, testUser, customFetchImpl } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000", "https://trusted.com"],
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			disableCSRFCheck: false,
			disableOriginCheck: false,
		},
	});

	describe("Form Parsing - Sign In", async (it) => {
		it("should parse form data for /sign-in/email", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
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

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(testUser.email);
			expect(response.headers.get("set-cookie")).toContain(
				"better-auth.session_token",
			);
		});

		it("should handle form data with callbackURL", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
				callbackURL: "http://localhost:3000", // Use exact trusted origin
			});

			const response = await customFetchImpl(
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

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
		});

	});

	describe("Form Parsing - Sign Up", async (it) => {
		it("should parse form data for /sign-up/email", async () => {
			const email = `test-${Date.now()}@example.com`;
			const formData = new URLSearchParams({
				email,
				password: "password123",
				name: "Test User",
			});

			const response = await customFetchImpl(
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

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(email);
			expect(data.user.name).toBe("Test User");
		});

		it("should handle form data with image field", async () => {
			const email = `test-${Date.now()}-2@example.com`;
			const formData = new URLSearchParams({
				email,
				password: "password123",
				name: "Test User 2",
				image: "https://example.com/avatar.jpg",
			});

			const response = await customFetchImpl(
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

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user.image).toBe("https://example.com/avatar.jpg");
		});
	});

	describe("JSON Parsing Still Works", async (it) => {
		it("should still accept JSON for /sign-in/email", async () => {
			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: testUser.email,
						password: testUser.password,
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(testUser.email);
		});

		it("should still accept JSON for /sign-up/email", async () => {
			const email = `test-${Date.now()}-json@example.com`;
			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-up/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email,
						password: "password123",
						name: "JSON Test User",
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user.email).toBe(email);
		});
	});

	describe("Form Rejection on Non-Auth Endpoints", async (it) => {
		it("should reject form submission on /update-user", async () => {
			const formData = new URLSearchParams({
				name: "New Name",
			});

			try {
				const response = await customFetchImpl(
					"http://localhost:3000/api/auth/update-user",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Origin: "http://localhost:3000",
							Cookie: "better-auth.session_token=test",
						},
						body: formData.toString(),
					},
				);

				// Form submissions should be rejected with 400 (content type error)
				// Content type check happens in onRequest hook before auth middleware
				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
			} catch (error: any) {
				// If error is thrown directly, it should be an APIError with BAD_REQUEST status
				expect(error.status).toBe("BAD_REQUEST");
				expect(error.body?.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
			}
		});

		it("should reject form submission on /change-password", async () => {
			const formData = new URLSearchParams({
				currentPassword: "old",
				newPassword: "new",
			});

			try {
				const response = await customFetchImpl(
					"http://localhost:3000/api/auth/change-password",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Origin: "http://localhost:3000",
							Cookie: "better-auth.session_token=test",
						},
						body: formData.toString(),
					},
				);

				// Form submissions should be rejected with 400 (content type error)
				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
			} catch (error: any) {
				// If error is thrown directly, it should be an APIError with BAD_REQUEST status
				expect(error.status).toBe("BAD_REQUEST");
				expect(error.body?.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
			}
		});

		it("should reject form submission on /reset-password", async () => {
			const formData = new URLSearchParams({
				token: "test-token",
				password: "newpassword",
			});

			try {
				const response = await customFetchImpl(
					"http://localhost:3000/api/auth/reset-password",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Origin: "http://localhost:3000",
						},
						body: formData.toString(),
					},
				);

				// Form submissions should be rejected with 400 (content type error)
				expect(response.status).toBe(400);
				const data = await response.json();
				expect(data.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
			} catch (error: any) {
				// If error is thrown directly, it should be an APIError with BAD_REQUEST status
				expect(error.status).toBe("BAD_REQUEST");
				expect(error.body?.message).toBe(BASE_ERROR_CODES.UNSUPPORTED_CONTENT_TYPE);
			}
		});
	});

	describe("CSRF / Origin Validation", async (it) => {
		it("should reject when Origin header is an untrusted domain", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "https://malicious.com",
						Cookie: "test=value", // Cookie triggers origin check
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(403);
			const data = await response.json();
			expect(data.message).toContain("Invalid");
		});

		it("should accept when Origin matches trustedOrigins", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
						Cookie: "test=value", // Cookie triggers origin check
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
		});

		it("should accept when Origin matches another trusted origin", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "https://trusted.com",
						Cookie: "test=value", // Cookie triggers origin check
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
		});

		it("should reject when Origin missing AND Referer missing (with cookies)", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Cookie: "test=value", // Cookie triggers origin check
						// No Origin or Referer headers
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(403);
			const data = await response.json();
			expect(data.message).toBe("Missing or null Origin");
		});

		it("should accept when Origin missing but Referer matches trustedOrigins", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Referer: "http://localhost:3000/login",
						Cookie: "test=value", // Cookie triggers origin check
						// No Origin header - Referer will be used as fallback
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
		});

		it("should reject when Referer is untrusted (Origin missing)", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Referer: "https://malicious.com/login",
						Cookie: "test=value", // Cookie triggers origin check
						// No Origin header - Referer will be used as fallback
					},
					body: formData.toString(),
				},
			);

			// Origin check should reject untrusted referer
			// The referer "https://malicious.com/login" should extract origin "https://malicious.com"
			// which doesn't match trusted origins ["http://localhost:3000", "https://trusted.com"]
			expect(response.status).toBe(403);
			const data = await response.json();
			expect(data.message).toBe("Invalid origin");
		});

		it("should allow requests without cookies (no origin check)", async () => {
			// Sign-up requests typically don't have cookies, so origin check is skipped
			const email = `test-${Date.now()}-nocookie@example.com`;
			const formData = new URLSearchParams({
				email,
				password: "password123",
				name: "No Cookie User",
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-up/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "https://malicious.com", // Untrusted origin
						// No Cookie header - origin check should be skipped
					},
					body: formData.toString(),
				},
			);

			// Should succeed because no cookies = no origin check
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
		});
	});

	describe("Error Handling", async (it) => {
		it("should handle malformed form data gracefully", async () => {
			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
					},
					body: "invalid-form-data-format",
				},
			);

			// Should still process (URLSearchParams is lenient)
			// But will fail validation due to missing email/password
			expect(response.status).toBeGreaterThanOrEqual(400);
		});

		it("should handle non-POST requests (form content type ignored)", async () => {
			// GET/HEAD requests cannot have a body, so we test with PUT instead
			// The form content type should be ignored for non-POST requests
			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
					},
					body: new URLSearchParams({
						email: testUser.email,
						password: testUser.password,
					}).toString(),
				},
			);

			// PUT is not allowed on this endpoint (only POST)
			// Should return 405 Method Not Allowed or 404, not a content-type error
			expect([404, 405]).toContain(response.status);
		});
	});

	describe("Integration Tests - End-to-End Form Submission", async (it) => {
		it("should work with standard HTML form POST (simulating <form method='POST' action='/sign-in/email'>)", async () => {
			// Simulate a standard HTML form submission
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Origin: "http://localhost:3000",
						Referer: "http://localhost:3000/login",
					},
					body: formData.toString(),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(testUser.email);
			expect(data.token).toBeDefined();

			// Verify session cookie is set
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toBeTruthy();
			expect(setCookie).toContain("better-auth.session_token");
		});

		it("should set session cookie with correct attributes (SameSite, Secure, HttpOnly)", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: testUser.password,
			});

			const response = await customFetchImpl(
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

			expect(response.status).toBe(200);
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toBeTruthy();

			// Parse the cookie to verify attributes
			const cookies = parseSetCookieHeader(setCookie || "");
			const sessionCookie = cookies.get("better-auth.session_token");

			expect(sessionCookie).toBeDefined();
			expect(sessionCookie?.value).toBeTruthy();

			// Verify cookie attributes
			// Note: Secure might be false in test environment (http://localhost)
			// SameSite should be "lax"
			expect(sessionCookie?.samesite).toBe("lax");
			// HttpOnly should be true
			expect(sessionCookie?.httponly).toBe(true);
			// Path should be "/"
			expect(sessionCookie?.path).toBe("/");
		});

		it("should work with form sign-up end-to-end", async () => {
			const email = `test-form-${Date.now()}@example.com`;
			const formData = new URLSearchParams({
				email,
				password: "password123",
				name: "Form Test User",
			});

			const response = await customFetchImpl(
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

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.user).toBeDefined();
			expect(data.user.email).toBe(email);
			expect(data.user.name).toBe("Form Test User");
			expect(data.token).toBeDefined();

			// Verify session cookie is set
			const setCookie = response.headers.get("set-cookie");
			expect(setCookie).toBeTruthy();
			expect(setCookie).toContain("better-auth.session_token");
		});
	});

	describe("Integration Tests - Error Response Consistency", async (it) => {
		it("should return same error codes for form sign-in as JSON sign-in (invalid email)", async () => {
			// Test with form
			const formData = new URLSearchParams({
				email: "invalid-email",
				password: "password123",
			});

			const formResponse = await customFetchImpl(
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

			expect(formResponse.status).toBe(400);
			const formError = await formResponse.json();
			expect(formError.message).toBe(BASE_ERROR_CODES.INVALID_EMAIL);

			// Test with JSON (should match)
			const jsonResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: "invalid-email",
						password: "password123",
					}),
				},
			);

			expect(jsonResponse.status).toBe(400);
			const jsonError = await jsonResponse.json();
			expect(jsonError.message).toBe(BASE_ERROR_CODES.INVALID_EMAIL);

			// Errors should match
			expect(formError.message).toBe(jsonError.message);
		});

		it("should return same error codes for form sign-in as JSON sign-in (invalid password)", async () => {
			// Test with form
			const formData = new URLSearchParams({
				email: testUser.email,
				password: "wrong-password",
			});

			const formResponse = await customFetchImpl(
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

			expect(formResponse.status).toBe(401);
			const formError = await formResponse.json();
			expect(formError.message).toBe(
				BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			);

			// Test with JSON (should match)
			const jsonResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: testUser.email,
						password: "wrong-password",
					}),
				},
			);

			expect(jsonResponse.status).toBe(401);
			const jsonError = await jsonResponse.json();
			expect(jsonError.message).toBe(
				BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
			);

			// Errors should match
			expect(formError.message).toBe(jsonError.message);
			expect(formError.status).toBe(jsonError.status);
		});

		it("should return same error codes for form sign-up as JSON sign-up (duplicate email)", async () => {
			// First, create a user with JSON
			const email = `test-duplicate-${Date.now()}@example.com`;
			await customFetchImpl("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email,
					password: "password123",
					name: "First User",
				}),
			});

			// Try to sign up again with form (should fail)
			const formData = new URLSearchParams({
				email,
				password: "password123",
				name: "Second User",
			});

			const formResponse = await customFetchImpl(
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

			expect(formResponse.status).toBe(422);
			const formError = await formResponse.json();
			expect(formError.message).toBe(
				BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
			);

			// Try to sign up again with JSON (should match)
			const jsonResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-up/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email,
						password: "password123",
						name: "Third User",
					}),
				},
			);

			expect(jsonResponse.status).toBe(422);
			const jsonError = await jsonResponse.json();
			expect(jsonError.message).toBe(
				BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
			);

			// Errors should match
			expect(formError.message).toBe(jsonError.message);
			expect(formError.status).toBe(jsonError.status);
		});

		it("should not set session cookie on form sign-in error (same as JSON)", async () => {
			const formData = new URLSearchParams({
				email: testUser.email,
				password: "wrong-password",
			});

			const formResponse = await customFetchImpl(
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

			expect(formResponse.status).toBe(401);
			// No session cookie should be set on error
			const setCookie = formResponse.headers.get("set-cookie");
			expect(setCookie).toBeNull();

			// JSON should behave the same
			const jsonResponse = await customFetchImpl(
				"http://localhost:3000/api/auth/sign-in/email",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: testUser.email,
						password: "wrong-password",
					}),
				},
			);

			expect(jsonResponse.status).toBe(401);
			const jsonSetCookie = jsonResponse.headers.get("set-cookie");
			expect(jsonSetCookie).toBeNull();
		});
	});
});

