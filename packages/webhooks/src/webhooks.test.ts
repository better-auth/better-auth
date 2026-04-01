import { createLogger } from "@better-auth/core/env";
import { describe, expect, it, vi } from "vitest";
import { deliverWebhook } from "./deliver";
import { webhooks } from "./index";
import {
	formatSignatureHeader,
	signWebhookPayload,
	verifyWebhookSignature,
	WEBHOOK_SIGNATURE_HEADER,
} from "./sign";

describe("webhook signing", () => {
	it("round-trips verifyWebhookSignature", async () => {
		const secret = "x".repeat(32);
		const rawBody = '{"hello":"world"}';
		const timestampSeconds = Math.floor(Date.now() / 1000);
		const sig = await signWebhookPayload(secret, timestampSeconds, rawBody);
		const header = formatSignatureHeader(timestampSeconds, sig);
		await expect(
			verifyWebhookSignature({
				rawBody,
				signatureHeader: header,
				secret,
				maxAgeSeconds: 600,
			}),
		).resolves.toBe(true);
	});

	it("rejects stale timestamps", async () => {
		const secret = "x".repeat(32);
		const rawBody = "{}";
		const timestampSeconds = Math.floor(Date.now() / 1000) - 3600;
		const sig = await signWebhookPayload(secret, timestampSeconds, rawBody);
		const header = formatSignatureHeader(timestampSeconds, sig);
		await expect(
			verifyWebhookSignature({
				rawBody,
				signatureHeader: header,
				secret,
				maxAgeSeconds: 300,
			}),
		).resolves.toBe(false);
	});
});

describe("deliverWebhook", () => {
	it("POSTs JSON with a verifiable signature header", async () => {
		const secret = "d".repeat(32);
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const logger = createLogger({ disabled: true });
		try {
			await deliverWebhook({
				url: "https://example.com/webhooks/auth",
				secret,
				payload: {
					id: "evt_test",
					type: "user.created",
					timestamp: "2026-03-30T12:00:00.000Z",
					data: { email: "a@b.com" },
				},
				timeoutMs: 5000,
				retries: 0,
				logger,
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
			expect(init?.method).toBe("POST");
			const rawBody = init?.body as string;
			const headers = new Headers(init?.headers as HeadersInit);
			const sig = headers.get(WEBHOOK_SIGNATURE_HEADER);
			await expect(
				verifyWebhookSignature({
					rawBody,
					signatureHeader: sig,
					secret,
					maxAgeSeconds: 600,
				}),
			).resolves.toBe(true);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("webhooks()", () => {
	it("throws when endpoints are missing", () => {
		expect(() =>
			webhooks({
				endpoints: [],
			}),
		).toThrow();
	});

	it("throws when secret is too short", () => {
		expect(() =>
			webhooks({
				endpoints: [{ url: "https://example.com/hooks", secret: "short" }],
			}),
		).toThrow();
	});
});
