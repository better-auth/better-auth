import type { BetterAuthPlugin } from "@better-auth/core";
import { BetterAuthError } from "better-auth";
import { deliverWebhook } from "./deliver";
import {
	sanitizeAccountRecord,
	sanitizeSessionRecord,
	sanitizeUserRecord,
} from "./sanitize";
import type {
	WebhookEventName,
	WebhookPayload,
	WebhooksPluginOptions,
} from "./types";

export {
	formatSignatureHeader,
	parseSignatureHeader,
	signWebhookPayload,
	verifyWebhookSignature,
	WEBHOOK_ID_HEADER,
	WEBHOOK_SIGNATURE_HEADER,
} from "./sign";
export type {
	WebhookEndpoint,
	WebhookEventDataMap,
	WebhookEventName,
	WebhookPayload,
	WebhooksPluginOptions,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		webhooks: {
			creator: typeof webhooks;
		};
	}
}

function createPayload<TType extends WebhookEventName>(
	type: TType,
	data: Record<string, unknown>,
): WebhookPayload<TType> {
	return {
		id: crypto.randomUUID(),
		type,
		timestamp: new Date().toISOString(),
		data,
	} as WebhookPayload<TType>;
}

function shouldSend(
	event: WebhookEventName,
	events: WebhookEventName[] | undefined,
): boolean {
	if (!events || events.length === 0) return true;
	return events.includes(event);
}

function validateEndpoints(endpoints: WebhooksPluginOptions["endpoints"]) {
	for (const ep of endpoints) {
		let parsed: URL;
		try {
			parsed = new URL(ep.url);
		} catch {
			throw new BetterAuthError(`Invalid webhook url: ${ep.url}`);
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new BetterAuthError(
				`Webhook url must use http or https: ${ep.url}`,
			);
		}
		if (!ep.secret || ep.secret.length < 16) {
			throw new BetterAuthError(
				"Each webhook endpoint must include a secret of at least 16 characters",
			);
		}
	}
}

/**
 * Sends signed outbound webhooks when users, sessions, or accounts are created, updated, or deleted.
 *
 * Configure one or more HTTPS URLs; each receives `POST` requests with a JSON body and
 * `x-better-auth-webhook-signature` (HMAC-SHA256 over `timestamp.body`) for verification.
 */
export function webhooks(options: WebhooksPluginOptions): BetterAuthPlugin {
	if (!options.endpoints?.length) {
		throw new BetterAuthError(
			"webhooks plugin requires at least one endpoint with url and secret",
		);
	}
	validateEndpoints(options.endpoints);

	const timeoutMs = options.timeoutMs ?? 10_000;
	const retries = options.retries ?? 1;

	return {
		id: "webhooks",
		init(ctx) {
			const dispatch = (
				event: WebhookEventName,
				data: Record<string, unknown>,
			) => {
				for (const endpoint of options.endpoints) {
					if (!shouldSend(event, endpoint.events)) continue;
					const payload = createPayload(event, data);
					void deliverWebhook({
						url: endpoint.url,
						secret: endpoint.secret,
						payload,
						timeoutMs,
						retries,
						logger: ctx.logger,
					});
				}
			};

			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async after(user) {
									if (!user) return;
									dispatch(
										"user.created",
										sanitizeUserRecord(user as Record<string, unknown>),
									);
								},
							},
							update: {
								async after(user) {
									if (!user) return;
									dispatch(
										"user.updated",
										sanitizeUserRecord(user as Record<string, unknown>),
									);
								},
							},
							delete: {
								async after(user) {
									if (!user) return;
									dispatch(
										"user.deleted",
										sanitizeUserRecord(user as Record<string, unknown>),
									);
								},
							},
						},
						session: {
							create: {
								async after(session) {
									if (!session) return;
									dispatch(
										"session.created",
										sanitizeSessionRecord(session as Record<string, unknown>),
									);
								},
							},
							update: {
								async after(session) {
									if (!session) return;
									dispatch(
										"session.updated",
										sanitizeSessionRecord(session as Record<string, unknown>),
									);
								},
							},
							delete: {
								async after(session) {
									if (!session) return;
									dispatch(
										"session.deleted",
										sanitizeSessionRecord(session as Record<string, unknown>),
									);
								},
							},
						},
						account: {
							create: {
								async after(account) {
									if (!account) return;
									dispatch(
										"account.created",
										sanitizeAccountRecord(account as Record<string, unknown>),
									);
								},
							},
							update: {
								async after(account) {
									if (!account) return;
									dispatch(
										"account.updated",
										sanitizeAccountRecord(account as Record<string, unknown>),
									);
								},
							},
							delete: {
								async after(account) {
									if (!account) return;
									dispatch(
										"account.deleted",
										sanitizeAccountRecord(account as Record<string, unknown>),
									);
								},
							},
						},
					},
				},
			};
		},
	};
}
