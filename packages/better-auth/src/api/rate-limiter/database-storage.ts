import type { AuthContext } from "@better-auth/core";
import type { RateLimit } from "@better-auth/core/db";
import type {
	RateLimitStateStore,
	RateLimitStateWrite,
	RateLimitStorage,
} from "@better-auth/rate-limit";
import {
	createCasRateLimitStorage,
	parseRateLimitState,
	serializeRateLimitState,
} from "@better-auth/rate-limit";

const PRUNE_INTERVAL_MS = 60_000;

export function createDatabaseRateLimitStorage(
	ctx: AuthContext,
): RateLimitStorage {
	const clock = Date.now;
	let lastPrunedAt = clock();
	const store: RateLimitStateStore<number> = {
		async get(key) {
			const row = await findRateLimitRow(ctx, key);
			if (!row || toNumber(row.expiresAt) <= clock()) {
				return null;
			}

			return {
				state: parseRateLimitState(row.state),
				revision: toNumber(row.revision),
			};
		},
		async compareAndSet(key, expectedRevision, value) {
			const now = clock();
			const updated =
				expectedRevision === null
					? await replaceMissingOrExpiredState(ctx, key, value, now)
					: await replaceRevision(ctx, key, expectedRevision, value);
			if (!updated) {
				return false;
			}

			if (now - lastPrunedAt >= PRUNE_INTERVAL_MS) {
				lastPrunedAt = now;
				await ctx.runInBackgroundOrAwait(
					ctx.adapter
						.deleteMany({
							model: "rateLimit",
							where: [{ field: "expiresAt", operator: "lte", value: now }],
						})
						.then(() => undefined)
						.catch((error) =>
							ctx.logger.error("Error pruning rate-limit state", error),
						),
				);
			}

			return true;
		},
	};

	return createCasRateLimitStorage(store, { clock });
}

async function replaceMissingOrExpiredState(
	ctx: AuthContext,
	key: string,
	value: RateLimitStateWrite,
	now: number,
): Promise<boolean> {
	const replaced = await ctx.adapter.incrementOne<RateLimit>({
		model: "rateLimit",
		where: [
			{ field: "key", value: key },
			{ field: "expiresAt", operator: "lte", value: now },
		],
		increment: {},
		set: {
			state: serializeRateLimitState(value.state),
			expiresAt: value.expiresAt,
			revision: 1,
		},
	});
	if (replaced) {
		return true;
	}

	try {
		await ctx.adapter.create<RateLimit>({
			model: "rateLimit",
			data: {
				key,
				state: serializeRateLimitState(value.state),
				expiresAt: value.expiresAt,
				revision: 1,
			},
		});
		return true;
	} catch (error) {
		if (await findRateLimitRow(ctx, key)) {
			return false;
		}
		throw error;
	}
}

async function replaceRevision(
	ctx: AuthContext,
	key: string,
	expectedRevision: number,
	value: RateLimitStateWrite,
): Promise<boolean> {
	const updated = await ctx.adapter.incrementOne<RateLimit>({
		model: "rateLimit",
		where: [
			{ field: "key", value: key },
			{ field: "revision", value: expectedRevision },
		],
		increment: { revision: 1 },
		set: {
			state: serializeRateLimitState(value.state),
			expiresAt: value.expiresAt,
		},
	});
	return updated !== null;
}

async function findRateLimitRow(
	ctx: AuthContext,
	key: string,
): Promise<RateLimit | null> {
	return ctx.adapter.findOne<RateLimit>({
		model: "rateLimit",
		where: [{ field: "key", value: key }],
	});
}

function toNumber(value: number | bigint): number {
	return typeof value === "bigint" ? Number(value) : value;
}
