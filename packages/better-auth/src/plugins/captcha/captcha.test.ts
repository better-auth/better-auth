import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { captcha } from ".";
import * as betterFetchModule from "@better-fetch/fetch";

vi.mock("@better-fetch/fetch", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof betterFetchModule;
	return {
		...actual,
		betterFetch: vi.fn(),
	};
});

describe("cloudflare-turnstile", async (it) => {
	const mockBetterFetch = betterFetchModule.betterFetch as ReturnType<
		typeof vi.fn
	>;

	const { client } = await getTestInstance({
		plugins: [
			captcha({ provider: "cloudflare-turnstile", secretKey: "xx-secret-key" }),
		],
	});
	const headers = new Headers();

	it("Should successful sign users if they passed the CAPTCHA challenge", async () => {
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
				},
			},
		});

		expect(res.data?.user).toBeDefined();
	});

	it("Should return 400 if no captcha token is found in the request headers", async () => {
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: {
				headers: {},
			},
		});
		expect(res.error?.status).toBe(400);
	});

	it("Should return 503 if the call to /siteverify fails", async () => {
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

		expect(res.error?.status).toBe(503);
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

	it("Should return 500 if an unexpected error occurs", async () => {
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
});

describe("google-recaptcha", async (it) => {
	const mockBetterFetch = betterFetchModule.betterFetch as ReturnType<
		typeof vi.fn
	>;

	const { client } = await getTestInstance({
		plugins: [
			captcha({ provider: "google-recaptcha", secretKey: "xx-secret-key" }),
		],
	});
	const headers = new Headers();

	it("Should successfuly sign users if they passed the CAPTCHA challenge", async () => {
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
				},
			},
		});

		expect(res.data?.user).toBeDefined();
	});

	it("Should return 400 if no captcha token is found in the request headers", async () => {
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "test123456",
			fetchOptions: {
				headers: {},
			},
		});
		expect(res.error?.status).toBe(400);
	});

	it("Should return 503 if the call to /siteverify fails", async () => {
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

		expect(res.error?.status).toBe(503);
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

	it("Should return 500 if an unexpected error occurs", async () => {
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
});
