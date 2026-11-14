import * as z from "zod";
import type { RateLimitState } from "../state";

const stateMetadataSchema = z.object({
	policyKey: z.string().min(1),
});

const rateLimitStateSchema = z.discriminatedUnion("strategy", [
	stateMetadataSchema.extend({
		strategy: z.literal("fixed-window"),
		count: z.int().nonnegative(),
		resetAt: z.int(),
	}),
	stateMetadataSchema.extend({
		strategy: z.literal("sliding-window-counter"),
		currentWindowStartedAt: z.int(),
		currentCount: z.int().nonnegative(),
		previousCount: z.int().nonnegative(),
	}),
	stateMetadataSchema.extend({
		strategy: z.literal("token-bucket"),
		tokens: z.number().nonnegative(),
		refilledAt: z.int(),
	}),
	stateMetadataSchema.extend({
		strategy: z.literal("gcra"),
		theoreticalArrivalTime: z.number().nonnegative(),
	}),
]);

const storedRateLimitStateSchema = z.object({
	version: z.literal(1),
	state: rateLimitStateSchema,
});

/** Serializes algorithm state for an opaque rate-limit state store. */
export function serializeRateLimitState(state: RateLimitState): string {
	return JSON.stringify({ version: 1, state });
}

/** Parses and validates algorithm state loaded from persistent storage. */
export function parseRateLimitState(value: string): RateLimitState {
	const parsed: unknown = JSON.parse(value);
	return storedRateLimitStateSchema.parse(parsed).state;
}
