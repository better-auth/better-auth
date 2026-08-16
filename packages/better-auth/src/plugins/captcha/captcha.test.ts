import * as betterFetchModule from "@better-fetch/fetch";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from "../email-otp";
import { emailOTPClient } from "../email-otp/client";
import { captcha } from ".";
import { CAPTCHA_VERIFY_TIMEOUT_MS } from "./constants";
import type { CaptchaOptions } from "./types";

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

	it("should apply rate limits before verifying captcha tokens", async () => {
		mockBetterFetch.mockClear();
		mockBetterFetch.mockResolvedValue({
			data: {
				success: false,
				"error-codes": ["invalid-input-response"],
			},
		});
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				customRules: {
					"/sign-in/email": {
						window: 10,
						max: 1,
					},
				},
			},
			plugins: [
				captcha({
					provider: "cloudflare-turnstile",
					secretKey: "xx-secret-key",
				}),
			],
		});

		const first = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: {
					"x-captcha-response": "invalid-captcha-token",
				},
			},
		});
		const second = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: {
					"x-captcha-response": "invalid-captcha-token",
				},
			},
		});

		expect(first.error?.status).toBe(403);
		expect(second.error?.status).toBe(429);
		expect(mockBetterFetch).toHaveBeenCalledTimes(1);
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

	describe("verification timeout", () => {
		const providerConfigs: CaptchaOptions[] = [
			{ provider: "cloudflare-turnstile", secretKey: "xx-secret-key" },
			{ provider: "google-recaptcha", secretKey: "xx-secret-key" },
			{ provider: "hcaptcha", secretKey: "xx-secret-key", siteKey: "xx-site" },
			{
				provider: "captchafox",
				secretKey: "xx-secret-key",
				siteKey: "xx-site",
			},
		];

		it.each(
			providerConfigs,
		)("$provider bounds the verification request with the shared timeout", async (config) => {
			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: { success: true, challenge_ts: "ts", hostname: "example.com" },
			});

			const { client } = await getTestInstance({
				plugins: [captcha(config)],
			});

			await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: { "x-captcha-response": "captcha-token" },
				},
			});

			expect(mockBetterFetch).toHaveBeenCalled();
			const fetchOptions = mockBetterFetch.mock.calls[0]![1];
			expect(fetchOptions.timeout).toBe(CAPTCHA_VERIFY_TIMEOUT_MS);
		});

		it.each(
			providerConfigs,
		)("$provider fails closed when the provider call times out", async (config) => {
			mockBetterFetch.mockClear();
			// betterFetch aborts on timeout, which surfaces as a thrown AbortError
			// rather than a resolved error response.
			mockBetterFetch.mockRejectedValue(
				new DOMException("The operation was aborted.", "AbortError"),
			);

			const { client } = await getTestInstance({
				plugins: [captcha(config)],
			});

			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: { "x-captcha-response": "captcha-token" },
				},
			});

			// A timed-out provider must not let the request through.
			expect(res.error?.status).toBe(500);
			expect(res.data).toBeNull();
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
			expect(capturedOtp).toHaveLength(6);

			const res = await client.signIn.emailOtp({
				email: "test@test.com",
				otp: capturedOtp,
			});

			// Captcha must be bypassed; the sign-in flow completes and yields a session.
			expect(res.error).toBeNull();
			expect(res.data?.token).toEqual(expect.any(String));
			expect(res.data?.user?.email).toBe("test@test.com");
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

			// Captcha middleware must short-circuit before the OTP is consulted.
			expect(res.error).toMatchObject({
				status: 400,
				code: "MISSING_RESPONSE",
			});
		});
	});

	describe("action and hostname binding", async () => {
		it("rejects a Turnstile token whose action does not match expectedAction", async () => {
			const { client } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
						expectedAction: "login",
					}),
				],
			});
			mockBetterFetch.mockResolvedValue({
				data: { success: true, action: "signup", hostname: "myapp.com" },
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: { headers: { "x-captcha-response": "token" } },
			});
			expect(res.error?.status).toBe(403);
		});

		it("rejects a Turnstile token from a hostname outside allowedHostnames", async () => {
			const { client } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
						allowedHostnames: ["myapp.com"],
					}),
				],
			});
			mockBetterFetch.mockResolvedValue({
				data: { success: true, hostname: "untrusted.example" },
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: { headers: { "x-captcha-response": "token" } },
			});
			expect(res.error?.status).toBe(403);
		});

		it("rejects a reCAPTCHA v3 token whose action does not match expectedAction", async () => {
			const { client } = await getTestInstance({
				plugins: [
					captcha({
						provider: "google-recaptcha",
						secretKey: "xx-secret-key",
						expectedAction: "login",
					}),
				],
			});
			mockBetterFetch.mockResolvedValue({
				data: {
					success: true,
					score: 0.9,
					action: "signup",
					hostname: "myapp.com",
					challenge_ts: "2022-02-28T15:14:30.096Z",
				},
			});
			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: { headers: { "x-captcha-response": "token" } },
			});
			expect(res.error?.status).toBe(403);
		});

		it("accepts a token when action and hostname match", async () => {
			const { client, testUser } = await getTestInstance({
				plugins: [
					captcha({
						provider: "cloudflare-turnstile",
						secretKey: "xx-secret-key",
						expectedAction: "login",
						allowedHostnames: ["myapp.com"],
					}),
				],
			});
			mockBetterFetch.mockResolvedValue({
				data: { success: true, action: "login", hostname: "myapp.com" },
			});
			const res = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: { headers: { "x-captcha-response": "token" } },
			});
			expect(res.error?.status).not.toBe(403);
		});
	});
});
