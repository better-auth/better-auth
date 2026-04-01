import type { InternalLogger } from "@better-auth/core/env";
import {
	formatSignatureHeader,
	signWebhookPayload,
	WEBHOOK_ID_HEADER,
	WEBHOOK_SIGNATURE_HEADER,
} from "./sign";
import type { WebhookPayload } from "./types";

export async function deliverWebhook(options: {
	url: string;
	secret: string;
	payload: WebhookPayload;
	timeoutMs: number;
	retries: number;
	logger: InternalLogger;
}): Promise<void> {
	const { url, secret, payload, timeoutMs, retries, logger } = options;
	const rawBody = JSON.stringify(payload);
	const timestampSeconds = Math.floor(Date.now() / 1000);
	const signatureHex = await signWebhookPayload(
		secret,
		timestampSeconds,
		rawBody,
	);
	const signature = formatSignatureHeader(timestampSeconds, signatureHex);
	const id = payload.id;

	let attempt = 0;
	const maxAttempts = Math.max(1, retries + 1);

	while (attempt < maxAttempts) {
		attempt++;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json; charset=utf-8",
					[WEBHOOK_ID_HEADER]: id,
					[WEBHOOK_SIGNATURE_HEADER]: signature,
					"user-agent": "Better-Auth-Webhooks/1.0",
				},
				body: rawBody,
				signal: controller.signal,
			});
			if (response.ok) {
				return;
			}
			logger.error(
				`Webhook delivery to ${url} failed with status ${response.status} (attempt ${attempt}/${maxAttempts})`,
			);
		} catch (err) {
			logger.error(
				`Webhook delivery to ${url} failed: ${err instanceof Error ? err.message : String(err)} (attempt ${attempt}/${maxAttempts})`,
			);
		} finally {
			clearTimeout(timer);
		}
	}
}
