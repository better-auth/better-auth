import type { SecondaryStorage } from "@better-auth/core/db";
import type { Where } from "@better-auth/core/db/adapter";

export const DEFAULT_ERC8128_CLEANUP_THROTTLE_SEC = 5 * 60;
const ERC8128_CLEANUP_LOCK_KEY = "erc8128:cleanup:lock";

export interface Erc8128CleanupAdapter {
	deleteMany(args: { model: string; where: Where[] }): Promise<number>;
}

export interface CleanupExpiredErc8128StorageOptions {
	adapter: Erc8128CleanupAdapter;
	now?: Date;
}

export interface CleanupExpiredErc8128StorageResult {
	nonceDeleted: number;
	verificationCacheDeleted: number;
	invalidationDeleted: number;
	totalDeleted: number;
}

export async function cleanupExpiredErc8128Storage(
	options: CleanupExpiredErc8128StorageOptions,
): Promise<CleanupExpiredErc8128StorageResult> {
	const now = options.now ?? new Date();
	const expiredWhere: Where[] = [
		{
			field: "expiresAt",
			operator: "lt",
			value: now,
		},
	];

	const nonceDeleted = await options.adapter
		.deleteMany({
			model: "erc8128Nonce",
			where: expiredWhere,
		})
		.catch(() => 0);
	const verificationCacheDeleted = await options.adapter
		.deleteMany({
			model: "erc8128VerificationCache",
			where: expiredWhere,
		})
		.catch(() => 0);
	const invalidationDeleted = await options.adapter
		.deleteMany({
			model: "erc8128Invalidation",
			where: expiredWhere,
		})
		.catch(() => 0);

	return {
		nonceDeleted,
		verificationCacheDeleted,
		invalidationDeleted,
		totalDeleted: nonceDeleted + verificationCacheDeleted + invalidationDeleted,
	};
}

export function createErc8128CleanupScheduler(options: {
	adapter: Erc8128CleanupAdapter;
	secondaryStorage?: SecondaryStorage;
	strategy?: "auto" | "off";
	throttleSec?: number;
}) {
	return {
		async schedule() {
			if (options.strategy === "off" || !options.secondaryStorage) {
				return;
			}
			const token =
				typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
					? crypto.randomUUID()
					: `${Date.now()}:${Math.random().toString(36).slice(2)}`;
			const throttleSec =
				options.throttleSec ?? DEFAULT_ERC8128_CLEANUP_THROTTLE_SEC;

			try {
				const existing = await options.secondaryStorage!.get(
					ERC8128_CLEANUP_LOCK_KEY,
				);
				if (existing) {
					return;
				}

				await options.secondaryStorage!.set(
					ERC8128_CLEANUP_LOCK_KEY,
					token,
					throttleSec,
				);

				const stored = await options.secondaryStorage!.get(
					ERC8128_CLEANUP_LOCK_KEY,
				);
				if (stored !== token) {
					return;
				}

				await cleanupExpiredErc8128Storage({
					adapter: options.adapter,
					now: new Date(),
				});
			} catch {}
		},
	};
}
