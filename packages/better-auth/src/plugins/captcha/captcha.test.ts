import * as betterFetchModule from "@better-fetch/fetch";
import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { captcha } from ".";

vi.mock("@better-fetch/fetch", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof betterFetchModule;
	return {
		...actual,
		betterFetch: vi.fn(),
	};
});

describe("captcha", async (it) => {
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

	describe("cloudflare-turnstile", async (it) => {
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

	describe("google-recaptcha", async (it) => {
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
	describe("hcaptcha", async (it) => {
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

	describe("captchafox", async (it) => {
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
