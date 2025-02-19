import type { AuthPluginSchema } from "..";

export const apiKeySchema = ({
	timeWindow,
	rateLimitMax,
}: { timeWindow: number; rateLimitMax: number }) =>
	({
		apikey: {
			modelName: "apikey",
			fields: {
				/**
				 * The unique identifier of the key.
				 */
				id: {
					type: "string",
					required: true,
					input: false,
					unique: true,
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
				},
				/**
				 * The user id of the user who created the key.
				 */
				userId: {
					type: "string",
					references: { model: "user", field: "id" },
					required: true,
					input: false,
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
				 * The time window in milliseconds for the rate limit.
				 */
				rateLimitTimeWindow: {
					type: "number",
					required: false,
					input: false,
					defaultValue: timeWindow,
				},
				/**
				 * The maximum number of requests allowed within the `rateLimitTimeWindow`.
				 */
				rateLimitMax: {
					type: "number",
					required: false,
					input: false,
					defaultValue: rateLimitMax,
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
				 * Any additional metadata you want to store with the key.
				 */
				metadata: {
					type: "string",
					required: false,
					input: false,
					transform: {
						input(value) {
							return JSON.stringify(value);
						},
						output(value) {
							if (!value) return undefined;
							return JSON.parse(value as string);
						},
					},
				},
			},
		},
	}) satisfies AuthPluginSchema;
