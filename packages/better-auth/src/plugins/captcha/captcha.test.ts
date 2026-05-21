import * as betterFetchModule from "@better-fetch/fetch";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
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
	describe("google-recaptcha-enterprise", async () => {
		const { client } = await getTestInstance({
			plugins: [
				captcha({
					provider: "google-recaptcha-enterprise",
					secretKey: "xx-api-key",
					projectId: "xx-project",
					siteKey: "xx-site-key",
				}),
			],
		});

		it("Should successfully sign in users if they passed the CAPTCHA challenge", async () => {
			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: {
					tokenProperties: {
						valid: true,
						action: "sign_in",
						hostname: "example.com",
						invalidReason: "INVALID_REASON_UNSPECIFIED",
					},
					riskAnalysis: { score: 0.9, reasons: [] },
				},
			});

			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
						"x-captcha-action": "sign_in",
						"x-forwarded-for": "127.0.0.1",
					},
				},
			});

			expect(res.data?.user).toBeDefined();
			expect(mockBetterFetch).toHaveBeenCalled();

			const [calledUrl, fetchOptions] = mockBetterFetch.mock.calls[0]!;
			expect(calledUrl).toBe(
				"https://recaptchaenterprise.googleapis.com/v1/projects/xx-project/assessments?key=xx-api-key",
			);
			expect(fetchOptions.method).toBe("POST");
			expect(fetchOptions.headers).toMatchObject({
				"Content-Type": "application/json",
			});
			const body = JSON.parse(fetchOptions.body as string);
			expect(body).toEqual({
				event: {
					token: "captcha-token",
					siteKey: "xx-site-key",
					userIpAddress: "127.0.0.1",
					expectedAction: "sign_in",
				},
			});
		});

		it("Should return 403 when tokenProperties.valid is false", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					tokenProperties: {
						valid: false,
						invalidReason: "EXPIRED",
					},
					riskAnalysis: { score: 0.9, reasons: [] },
				},
			});

			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "expired-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});

		it("Should return 403 when riskAnalysis.score is below minScore", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					tokenProperties: { valid: true, action: "" },
					riskAnalysis: { score: 0.1, reasons: ["AUTOMATION"] },
				},
			});

			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "low-score-token",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});

		it("Should return 403 when expectedAction is provided and does not match", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					tokenProperties: { valid: true, action: "homepage" },
					riskAnalysis: { score: 0.9, reasons: [] },
				},
			});

			const res = await client.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
						"x-captcha-action": "sign_in",
					},
				},
			});

			expect(res.error?.status).toBe(403);
		});

		it("Should pass when no expectedAction header is sent (action check skipped)", async () => {
			mockBetterFetch.mockResolvedValue({
				data: {
					tokenProperties: { valid: true, action: "anything" },
					riskAnalysis: { score: 0.9, reasons: [] },
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

			expect(res.data?.user).toBeDefined();
		});

		it("Should return 500 if the assessments call fails", async () => {
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

		it("Should honor siteVerifyURLOverride", async () => {
			const { client: overrideClient } = await getTestInstance({
				plugins: [
					captcha({
						provider: "google-recaptcha-enterprise",
						secretKey: "xx-api-key",
						projectId: "xx-project",
						siteKey: "xx-site-key",
						siteVerifyURLOverride:
							"https://proxy.example.com/recaptcha-assessment",
					}),
				],
			});

			mockBetterFetch.mockClear();
			mockBetterFetch.mockResolvedValue({
				data: {
					tokenProperties: { valid: true, action: "" },
					riskAnalysis: { score: 0.9, reasons: [] },
				},
			});

			await overrideClient.signIn.email({
				email: "test@test.com",
				password: "test123456",
				fetchOptions: {
					headers: {
						"x-captcha-response": "captcha-token",
					},
				},
			});

			const [calledUrl] = mockBetterFetch.mock.calls[0]!;
			expect(calledUrl).toBe("https://proxy.example.com/recaptcha-assessment");
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
});
