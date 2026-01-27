import type { GenericEndpointContext } from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { CibaRequestData } from "./types";

const CIBA_PREFIX = "ciba:";

/**
 * Get storage key for a CIBA request
 */
function getStorageKey(authReqId: string): string {
	return `${CIBA_PREFIX}${authReqId}`;
}

/**
 * Store a new CIBA request.
 * Uses secondary storage (Redis) if available, otherwise falls back to verification table.
 */
export async function storeCibaRequest(
	ctx: GenericEndpointContext,
	data: CibaRequestData,
): Promise<void> {
	const key = getStorageKey(data.authReqId);
	const value = JSON.stringify(data);
	const ttlSeconds = Math.floor((data.expiresAt - Date.now()) / 1000);

	console.log(`[CIBA DEBUG] storeCibaRequest called with key: ${key}, ttl: ${ttlSeconds}`);
	console.log(`[CIBA DEBUG] secondaryStorage exists: ${!!ctx.context.secondaryStorage}`);

	try {
		if (ctx.context.secondaryStorage) {
			await ctx.context.secondaryStorage.set(key, value, ttlSeconds);
			console.log(`[CIBA DEBUG] Stored in secondaryStorage`);
		} else {
			console.log(`[CIBA DEBUG] Calling createVerificationValue...`);
			const result = await ctx.context.internalAdapter.createVerificationValue({
				identifier: key,
				value,
				expiresAt: new Date(data.expiresAt),
			});
			console.log(`[CIBA DEBUG] createVerificationValue result:`, result);
		}
	} catch (error) {
		console.error(`[CIBA DEBUG] Error storing request:`, error);
		throw error;
	}
}

/**
 * Find a CIBA request by auth_req_id.
 */
export async function findCibaRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<CibaRequestData | null> {
	const key = getStorageKey(authReqId);

	try {
		if (ctx.context.secondaryStorage) {
			const value = await ctx.context.secondaryStorage.get(key);
			ctx.context.logger.info(`[CIBA] Find in secondaryStorage: ${key} -> ${value ? "found" : "not found"}`);
			if (!value) return null;
			return safeJSONParse<CibaRequestData>(value);
		}

		const verification =
			await ctx.context.internalAdapter.findVerificationValue(key);
		ctx.context.logger.info(`[CIBA] Find in verification table: ${key} -> ${verification ? "found" : "not found"}`);
		if (!verification) return null;

		if (verification.expiresAt < new Date()) {
			ctx.context.logger.info(`[CIBA] Request expired, deleting: ${key}`);
			await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
			return null;
		}

		return safeJSONParse<CibaRequestData>(verification.value);
	} catch (error) {
		ctx.context.logger.error(`[CIBA] Failed to find request: ${error}`);
		return null;
	}
}

/**
 * Update a CIBA request.
 * Used for:
 * - Updating `lastPolledAt` and `pollingInterval` when agent polls (rate limiting)
 * - Updating `status` to "approved" or "rejected" when user responds
 *
 * Note: This uses read-modify-write pattern which has a potential race condition
 * between concurrent updates (e.g., user approving while agent polls). To mitigate:
 * - Status updates are preserved even if concurrent poll updates occur
 * - For production, consider using Redis transactions or database-level locks
 */
export async function updateCibaRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
	updates: Partial<CibaRequestData>,
): Promise<CibaRequestData | null> {
	const key = getStorageKey(authReqId);

	// Re-fetch to get latest state (minimize race window)
	const existing = await findCibaRequest(ctx, authReqId);
	if (!existing) return null;

	// If the request is already approved/rejected, don't allow poll updates to change status
	// This ensures user actions take precedence over agent polling
	if (existing.status !== "pending" && !updates.status) {
		// Only allow lastPolledAt/pollingInterval updates on non-pending requests
		const safeUpdates: Partial<CibaRequestData> = {
			lastPolledAt: updates.lastPolledAt,
			pollingInterval: updates.pollingInterval,
		};
		const updated: CibaRequestData = { ...existing, ...safeUpdates };
		const value = JSON.stringify(updated);
		const ttlSeconds = Math.floor((updated.expiresAt - Date.now()) / 1000);

		if (ctx.context.secondaryStorage) {
			await ctx.context.secondaryStorage.set(key, value, ttlSeconds);
		} else {
			const verification =
				await ctx.context.internalAdapter.findVerificationValue(key);
			if (verification) {
				await ctx.context.internalAdapter.updateVerificationValue(
					verification.id,
					{ value },
				);
			}
		}
		return updated;
	}

	const updated: CibaRequestData = { ...existing, ...updates };
	const value = JSON.stringify(updated);
	const ttlSeconds = Math.floor((updated.expiresAt - Date.now()) / 1000);

	if (ctx.context.secondaryStorage) {
		await ctx.context.secondaryStorage.set(key, value, ttlSeconds);
	} else {
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(key);
		if (verification) {
			await ctx.context.internalAdapter.updateVerificationValue(
				verification.id,
				{ value },
			);
		}
	}

	return updated;
}

/**
 * Delete a CIBA request.
 * Called after tokens are issued or request is denied/expired.
 */
export async function deleteCibaRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<void> {
	const key = getStorageKey(authReqId);

	if (ctx.context.secondaryStorage) {
		await ctx.context.secondaryStorage.delete(key);
	} else {
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(key);
		if (verification) {
			await ctx.context.internalAdapter.deleteVerificationValue(
				verification.id,
			);
		}
	}
}
