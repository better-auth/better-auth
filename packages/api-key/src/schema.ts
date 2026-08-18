import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { parseJSON } from "better-auth/client";

export const apiKeySchema = ({
	defaultRateLimitMax,
	defaultTimeWindow,
}: {
	defaultTimeWindow: number;
	defaultRateLimitMax: number;
}) =>
	({
		apikey: {
			fields: {
				configId: {
					type: "string",
					required: true,
					defaultValue: "default",
					input: false,
					index: true,
				},
				/**
				 * The name of the key.
				 */
				name: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * Shows the first few characters of the API key
				 * This allows you to show those few characters in the UI to make it easier for users to identify the API key.
				 */
				start: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * The ID of the entity that owns this key (userId or organizationId based on config's `references` setting).
				 */
				referenceId: {
					type: "string",
					required: true,
					input: false,
					index: true,
				},
				/**
				 * The prefix of the key.
				 */
				prefix: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * The hashed key value.
				 */
				key: {
					type: "string",
					required: true,
					input: false,
					index: true,
				},
				/**
				 * The interval to refill the key in milliseconds.
				 */
				refillInterval: {
					type: "number",
					required: false,
					input: false,
				},
				/**
				 * The amount to refill the remaining count of the key.
				 */
				refillAmount: {
					type: "number",
					required: false,
					input: false,
				},
				/**
				 * The date and time when the key was last refilled.
				 */
				lastRefillAt: {
					type: "date",
					required: false,
					input: false,
				},
				/**
				 * Whether the key is enabled.
				 */
				enabled: {
					type: "boolean",
					required: false,
					input: false,
					defaultValue: true,
				},
				/**
				 * Whether the key has rate limiting enabled.
				 */
				rateLimitEnabled: {
					type: "boolean",
					required: false,
					input: false,
					defaultValue: true,
				},
				/**
				 * The time window in milliseconds for the rate limit.
				 */
				rateLimitTimeWindow: {
					type: "number",
					required: false,
					input: false,
					defaultValue: defaultTimeWindow,
				},
				/**
				 * The maximum number of requests allowed within the `rateLimitTimeWindow`.
				 */
				rateLimitMax: {
					type: "number",
					required: false,
					input: false,
					defaultValue: defaultRateLimitMax,
				},
				/**
				 * The number of requests made within the rate limit time window
				 */
				requestCount: {
					type: "number",
					required: false,
					input: false,
					defaultValue: 0,
				},
				/**
				 * Start of the current fixed rate-limit window. The window is
				 * `[rateLimitWindowStart, rateLimitWindowStart + rateLimitTimeWindow)`.
				 */
				rateLimitWindowStart: {
					type: "date",
					required: false,
					input: false,
				},
				/**
				 * The remaining number of requests before the key is revoked.
				 *
				 * If this is null, then the key is not revoked.
				 *
				 * If `refillInterval` & `refillAmount` are provided, than this will refill accordingly.
				 */
				remaining: {
					type: "number",
					required: false,
					input: false,
				},
				/**
				 * The date and time of the last request made to the key.
				 */
				lastRequest: {
					type: "date",
					required: false,
					input: false,
				},
				/**
				 * The date and time when the key will expire.
				 */
				expiresAt: {
					type: "date",
					required: false,
					input: false,
				},
				/**
				 * The date and time when the key was created.
				 */
				createdAt: {
					type: "date",
					required: true,
					input: false,
				},
				/**
				 * The date and time when the key was last updated.
				 */
				updatedAt: {
					type: "date",
					required: true,
					input: false,
				},
				/**
				 * The permissions of the key.
				 */
				permissions: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * Any additional metadata you want to store with the key.
				 */
				metadata: {
					type: "string",
					required: false,
					input: true,
					transform: {
						input(value) {
							return JSON.stringify(value);
						},
						output(value) {
							if (!value) return null;
							return parseJSON<any>(value as string);
						},
					},
				},
			},
		},
	}) satisfies BetterAuthPluginDBSchema;
