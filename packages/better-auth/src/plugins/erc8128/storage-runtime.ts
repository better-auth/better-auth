import type { GenericEndpointContext } from "@better-auth/core";
import type { NonceStore } from "@slicekit/erc8128";
import {
	createErc8128CleanupScheduler,
	DEFAULT_ERC8128_CLEANUP_THROTTLE_SEC,
} from "./cleanup";
import type { InvalidationOps } from "./invalidation-store";
import {
	createDBInvalidationOps,
	createDualInvalidationOps,
	createMemoryInvalidationOps,
	createSecondaryStorageInvalidationOps,
	DEFAULT_INVALIDATION_TTL_SEC,
} from "./invalidation-store";
import {
	createAdapterNonceStore,
	createDualNonceStore,
	createMemoryNonceStore,
	createSecondaryStorageNonceStore,
} from "./nonce-store";
import type { VerificationCacheOps } from "./verification-cache";
import { createVerificationCacheOps } from "./verification-cache";

export type Erc8128StorageMode = "secondary-storage" | "database" | "none";

interface Erc8128StorageRuntimeOptions {
	maxValiditySec?: number | undefined;
	storeInDatabase?: boolean | undefined;
	cleanupStrategy?: "auto" | "off" | undefined;
	cleanupThrottleSec?: number | undefined;
	warnNoStorage: () => void;
	defaultMaxValiditySec: number;
}

/**
 * Centralizes how the plugin chooses between database, secondary storage, and
 * in-memory fallbacks. Keeping this branching in one place makes the request
 * flow easier to read in `index.ts`.
 */
export function createErc8128StorageRuntime(
	options: Erc8128StorageRuntimeOptions,
) {
	const cleanupThrottleSec =
		options.cleanupThrottleSec ?? DEFAULT_ERC8128_CLEANUP_THROTTLE_SEC;
	let persistentCache: VerificationCacheOps | null = null;
	let persistentCacheStrategy: Extract<
		Erc8128StorageMode,
		"secondary-storage" | "database"
	> | null = null;

	const ensureStorageMode = (
		ctx: GenericEndpointContext,
	): Erc8128StorageMode => {
		if (ctx.context.secondaryStorage) {
			return "secondary-storage";
		}

		// Stateless Better Auth setups still have the in-memory adapter in
		// context, but that storage is not durable enough for nonces,
		// invalidations, or replayable verification cache entries.
		if (!ctx.context.options.database || ctx.context.adapter.id === "memory") {
			options.warnNoStorage();
			return "none";
		}

		return "database";
	};

	const getCache = (ctx: GenericEndpointContext): VerificationCacheOps => {
		const strategy: Extract<
			Erc8128StorageMode,
			"secondary-storage" | "database"
		> = ctx.context.secondaryStorage ? "secondary-storage" : "database";

		if (persistentCache && persistentCacheStrategy === strategy) {
			return persistentCache;
		}

		persistentCacheStrategy = strategy;
		persistentCache = createVerificationCacheOps(
			strategy,
			ctx.context.secondaryStorage,
			ctx.context.adapter,
		);
		return persistentCache;
	};

	const getInvalidationOps = (
		ctx: GenericEndpointContext,
		storageMode: Erc8128StorageMode,
	): InvalidationOps => {
		if (storageMode === "none") {
			return createMemoryInvalidationOps(
				Math.max(
					(options.maxValiditySec ?? options.defaultMaxValiditySec) * 2,
					DEFAULT_INVALIDATION_TTL_SEC,
				),
			);
		}

		const dbOps = createDBInvalidationOps(ctx.context.adapter);
		if (!ctx.context.secondaryStorage) {
			return dbOps;
		}

		const invalidationTtl = Math.max(
			(options.maxValiditySec ?? options.defaultMaxValiditySec) * 2,
			DEFAULT_INVALIDATION_TTL_SEC,
		);
		const ssOps = createSecondaryStorageInvalidationOps(
			ctx.context.secondaryStorage,
			invalidationTtl,
		);

		return options.storeInDatabase
			? createDualInvalidationOps(dbOps, ssOps)
			: ssOps;
	};

	const getNonceStore = (
		ctx: GenericEndpointContext,
		storageMode: Erc8128StorageMode,
	): NonceStore => {
		if (storageMode === "none") {
			return createMemoryNonceStore();
		}

		if (!ctx.context.secondaryStorage) {
			return createAdapterNonceStore(ctx.context.adapter, ctx.context.logger);
		}

		const ssStore = createSecondaryStorageNonceStore(
			ctx.context.secondaryStorage,
			ctx.context.logger,
		);

		return options.storeInDatabase
			? createDualNonceStore(
					createAdapterNonceStore(ctx.context.adapter, ctx.context.logger),
					ssStore,
				)
			: ssStore;
	};

	const scheduleCleanup = async (ctx: GenericEndpointContext) => {
		if (
			(options.cleanupStrategy ?? "auto") !== "auto" ||
			!options.storeInDatabase ||
			!ctx.context.secondaryStorage
		) {
			return;
		}

		try {
			await createErc8128CleanupScheduler({
				adapter: ctx.context.adapter,
				secondaryStorage: ctx.context.secondaryStorage,
				strategy: "auto",
				throttleSec: cleanupThrottleSec,
			}).schedule();
		} catch {
			// Cleanup is best-effort background maintenance and must never affect
			// request verification latency or outcome.
		}
	};

	return {
		ensureStorageMode,
		getCache,
		getInvalidationOps,
		getNonceStore,
		scheduleCleanup,
	};
}
