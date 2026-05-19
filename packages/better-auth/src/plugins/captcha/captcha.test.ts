import * as betterFetchModule from "@better-fetch/fetch";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from "../email-otp";
import { emailOTPClient } from "../email-otp/client";
import { captcha } from ".";

vi.mock("@better-fetch/fetch", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof betterFetchModule;
	return {
		...actual,
		betterFetch: vi.fn(),
	};
});

describe("captcha", async () => {
	const mockBetterFetch = betterFetchModule.betterFetch as ReturnType<
		typeof vi.fn
	>;
	it("Should ignore non-protected endpoints", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "cloudflare-turnstile",
					secretKey: "xx-secret-key",
					endpoints: ["/sign-up"],
				}),
			],
		});

		mockBetterFetch.mockResolvedValue({
			data: {
				success: false,
				"error-codes": ["invalid-input-response"],
			},
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: {
				headers: {
					"x-captcha-response": "invalid-captcha-token",
				},
			},
		});

		expect(res.data?.user).toBeDefined();
	});

	it("Should return a 500 when missing secret key", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "cloudflare-turnstile",
					secretKey: "",
				}),
			],
		});

		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: {
				headers: {
					"x-captcha-response": "invalid-captcha-token",
				},
			},
		});

		expect(res.error?.status).toBe(500);
	});

	it("Should return 400 if no captcha token is found in the request headers", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "cloudflare-turnstile",
					secretKey: "xx-secret-key",
				}),
			],
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: {
				headers: {},
			},
		});
		expect(res.error?.status).toBe(400);
	});

	it("Should return 500 if an unexpected error occurs", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "cloudflare-turnstile",
					secretKey: "xx-secret-key",
				}),
			],
		});

		mockBetterFetch.mockRejectedValue(new Error("Failed to fetch"));

		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: {
				headers: {
					"x-captcha-response": "captcha-token",
				},
			},
		});

		expect(res.error?.status).toBe(500);
	});

	describe("cloudflare-turnstile", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "cloudflare-turnstile",
					secretKey: "xx-secret-key",
				}),
			],
		});

		it("Should successfully sign in users if they passed the CAPTCHA challenge", async () => {
			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: {
					success: true,
					challenge_ts: "2022-02-28T15:14:30.096Z",
					hostname: "example.com",
					"error-codes": [],
					action: "login",
					cdata: "sessionid-123456789",
					metadata: {
						ephemeral_id: "x:9f78e0ed210960d7693b167e",
					},
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
						"x-forwarded-for": "127.0.0.1",
					},
				},
			});

			expect(res.data?.user).toBeDefined();
			// Verify the auto-detected IP was sent to the provider
			expect(mockBetterFetch).toHaveBeenCalled();
		});

		it("Should return 500 if the call to /siteverify fails", async () => {
			mockBetterFetch.mockResolvedValue({
				error: "Failed to fetch",
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(500);
		});

		it("Should return 403 in case of a validation failure", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					success: false,
					"error-codes": ["invalid-input-response"],
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});
	});

	describe("google-recaptcha", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({ provider: "google-recaptcha", secretKey: "xx-secret-key" }),
			],
		});

		it("Should successfully sign in users if they passed the CAPTCHA challenge", async () => {
			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: {
					success: true,
					challenge_ts: "2022-02-28T15:14:30.096Z",
					hostname: "example.com",
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
						"x-forwarded-for": "127.0.0.1",
					},
				},
			});

			expect(res.data?.user).toBeDefined();

			// Verify the auto-detected IP was sent to the provider
			expect(mockBetterFetch).toHaveBeenCalled();
			const fetchOptions = mockBetterFetch.mock.calls[0]![1];
			const body = new URLSearchParams(fetchOptions.body as string);
			expect(body.get("remoteip")).toBe("127.0.0.1");
		});

		it("Should return 500 if the call to /siteverify fails", async () => {
			mockBetterFetch.mockResolvedValue({
				error: "Failed to fetch",
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(500);
		});

		it("Should return 403 in case of a validation failure", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					success: false,
					"error-codes": ["invalid-input-response"],
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "invalid-captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});

		it("Should return 403 in case of a too low score (ReCAPTCHA v3)", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					success: true,
					score: 0.4, // Default minScore is 0.5
					action: "yourAction",
					challenge_ts: "2022-02-28T15:14:30.096Z",
					hostname: "example.com",
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "low-score-captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});
	});
	describe("hcaptcha", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "hcaptcha",
					secretKey: "xx-secret-key",
					siteKey: "xx-site-key",
				}),
			],
		});

		it("Should successfully sign in users if they passed the CAPTCHA challenge", async () => {
			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: {
					success: true,
					challenge_ts: "2022-02-28T15:14:30.096Z",
					hostname: "example.com",
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
						"x-forwarded-for": "127.0.0.1",
					},
				},
			});

			expect(res.data?.user).toBeDefined();

			// Verify the auto-detected IP was sent to the provider
			expect(mockBetterFetch).toHaveBeenCalled();
			const fetchOptions = mockBetterFetch.mock.calls[0]![1];
			const body = new URLSearchParams(fetchOptions.body as string);
			expect(body.get("remoteip")).toBe("127.0.0.1");
		});

		it("Should return 500 if the call to /siteverify fails", async () => {
			mockBetterFetch.mockResolvedValue({
				error: "Failed to fetch",
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(500);
		});

		it("Should return 403 in case of a validation failure", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					success: false,
					"error-codes": ["invalid-input-response"],
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "invalid-captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});
	});

	describe("captchafox", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "captchafox",
					secretKey: "xx-secret-key",
					siteKey: "xx-site-key",
				}),
			],
		});

		it("Should successfully sign in users if they passed the CAPTCHA challenge", async () => {
			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: {
					success: true,
					challenge_ts: "2022-02-28T15:14:30.096Z",
					hostname: "example.com",
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
						"x-forwarded-for": "127.0.0.1",
					},
				},
			});

			expect(res.data?.user).toBeDefined();

			// Verify the auto-detected IP was sent to the provider
			expect(mockBetterFetch).toHaveBeenCalled();
		});

		it("Should return 500 if the call to /siteverify fails", async () => {
			mockBetterFetch.mockResolvedValue({
				error: "Failed to fetch",
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(500);
		});

		it("Should return 403 in case of a validation failure", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					success: false,
					"error-codes": ["invalid-input-response"],
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "invalid-captcha-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});
	});

	describe("exempt paths", () => {
		it("should not apply captcha to /sign-in/email-otp with default endpoints", async () => {
			let capturedOtp = "";

			const { client } = await getTestInstance(
				{
					plugins: [
						captcha({
							provider: "cloudflare-turnstile",
							secretKey: "xx-secret-key",
						}),
						emailOTP({
							async sendVerificationOTP({ otp }) {
								capturedOtp = otp;
							},
						}),
					],
				},
				{
					clientOptions: {
						plugins: [emailOTPClient()],
					},
				},
			);

			const send = await client.emailOtp.sendVerificationOtp({
				email: "test@test.com",
				type: "sign-in",
			});
			expect(send.data?.success).toBe(true);
			expect(capturedOtp.length).toBe(6);

			const res = await client.signIn.emailOtp({
				email: "test@test.com",
				otp: capturedOtp,
			});

			expect(res.error?.status).not.toBe(400);
		});

		it("should still apply captcha when /sign-in/email-otp is explicitly opted in", async () => {
			const { client } = await getTestInstance(
				{
					plugins: [
						captcha({
							provider: "cloudflare-turnstile",
							secretKey: "xx-secret-key",
							endpoints: ["/sign-in/email-otp"],
						}),
						emailOTP({
							sendVerificationOTP: async () => {},
						}),
					],
				},
				{
					clientOptions: {
						plugins: [emailOTPClient()],
					},
				},
			);

			const res = await client.signIn.emailOtp({
				email: "test@test.com",
				otp: "000000",
			});

			expect(res.error?.status).toBe(400);
		});

		it("should still apply captcha when a protected pathname contains duplicate slashes", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
					}),
				],
			});

			const res = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-in//email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: "test@test.com",
						password: "test123456",
					}),
				}),
			);

			expect(res.status).toBe(400);
		});

		it("should still apply captcha when a protected pathname has a trailing slash", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
					}),
				],
			});

			const res = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-in/email/", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: "test@test.com",
						password: "test123456",
					}),
				}),
			);

			expect(res.status).toBe(400);
		});

		it("should still apply captcha when a protected pathname has leading duplicate slashes", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
					}),
				],
			});

			const res = await auth.handler(
				new Request("http://localhost:3000/api/auth//sign-in/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: "test@test.com",
						password: "test123456",
					}),
				}),
			);

			expect(res.status).toBe(400);
		});

		it("should not apply captcha to sub-routes of default protected endpoints", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
					}),
				],
			});

			const res = await auth.handler(
				new Request(
					"http://localhost:3000/api/auth/sign-in/email/extra-segment",
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({}),
					},
				),
			);

			// Captcha must not block sub-routes; only paths listed in `endpoints`
			// are protected after the move from substring to exact matching.
			expect(res.status).not.toBe(400);
		});
	});

	describe("wildcard endpoints", () => {
		it("should apply captcha to single-segment wildcard matches", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
						endpoints: ["/sign-in/*"],
					}),
				],
			});

			const res = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-in/email-otp", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				}),
			);

			expect(res.status).toBe(400);
		});

		it("should not match nested routes with a single-segment wildcard", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
						endpoints: ["/sign-in/*"],
					}),
				],
			});

			const res = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-in/social/google", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				}),
			);

			// Single-segment `*` stops at slashes, mirroring rate-limiter and
			// trusted-origin semantics.
			expect(res.status).not.toBe(400);
		});

		it("should apply captcha to nested routes with a multi-segment wildcard", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
						endpoints: ["/sign-in/**"],
					}),
				],
			});

			const res = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-in/social/google", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({}),
				}),
			);

			expect(res.status).toBe(400);
		});
	});
});
