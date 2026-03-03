import type { GenericEndpointContext } from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import type { AsyncAuthRequestData } from "./types";

const ASYNC_AUTH_PREFIX = "async-auth:";

function getStorageKey(authReqId: string): string {
	return `${ASYNC_AUTH_PREFIX}${authReqId}`;
}

/**
 * Store a new async auth request.
 * Uses secondary storage (Redis) if available, otherwise falls back to verification table.
 */
export async function storeAsyncAuthRequest(
	ctx: GenericEndpointContext,
	data: AsyncAuthRequestData,
): Promise<void> {
	const key = getStorageKey(data.authReqId);
	const value = JSON.stringify(data);
	const ttlSeconds = Math.floor((data.expiresAt - Date.now()) / 1000);

	if (ctx.context.secondaryStorage) {
		await ctx.context.secondaryStorage.set(key, value, ttlSeconds);
	} else {
		await ctx.context.internalAdapter.createVerificationValue({
			identifier: key,
			value,
			expiresAt: new Date(data.expiresAt),
		});
	}
}

/**
 * Find an async auth request by auth_req_id.
 */
export async function findAsyncAuthRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<AsyncAuthRequestData | null> {
	const key = getStorageKey(authReqId);

	if (ctx.context.secondaryStorage) {
		const value = await ctx.context.secondaryStorage.get(key);
		if (!value) return null;
		return safeJSONParse<AsyncAuthRequestData>(value);
	}

	const verification =
		await ctx.context.internalAdapter.findVerificationValue(key);
	if (!verification) return null;

	if (verification.expiresAt < new Date()) {
		await ctx.context.internalAdapter.deleteVerificationByIdentifier(key);
		return null;
	}

	return safeJSONParse<AsyncAuthRequestData>(verification.value);
}

/**
 * Persist an async auth request value to the backing store.
 */
async function writeRequest(
	ctx: GenericEndpointContext,
	key: string,
	data: AsyncAuthRequestData,
): Promise<void> {
	const value = JSON.stringify(data);
	const ttlSeconds = Math.floor((data.expiresAt - Date.now()) / 1000);

	if (ctx.context.secondaryStorage) {
		await ctx.context.secondaryStorage.set(key, value, ttlSeconds);
	} else {
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(key);
		if (verification) {
			await ctx.context.internalAdapter.updateVerificationByIdentifier(key, {
				value,
			});
		}
	}
}

/**
 * Update an async auth request.
 * Used for:
 * - Updating `lastPolledAt` and `pollingInterval` when agent polls (rate limiting)
 * - Updating `status` to "approved" or "rejected" when user responds
 *
 * Race condition mitigation:
 * 1. Status transitions are one-way: pending → approved | rejected.
 *    Once status leaves "pending", poll-only updates cannot revert it.
 * 2. Poll updates (lastPolledAt, pollingInterval) are safe to lose — the
 *    worst case is a slightly stale polling interval, which self-corrects
 *    on the next poll.
 * 3. Status updates re-read the record immediately before writing and
 *    verify the write succeeded. If a concurrent poll overwrote the status,
 *    the status update retries once.
 * 4. For production deployments with high concurrency, configuring
 *    secondaryStorage (Redis) is recommended — Redis SET is atomic.
 */
export async function updateAsyncAuthRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
	updates: Partial<AsyncAuthRequestData>,
): Promise<AsyncAuthRequestData | null> {
	const key = getStorageKey(authReqId);

	const existing = await findAsyncAuthRequest(ctx, authReqId);
	if (!existing) return null;

	// Status transitions are one-way: once approved/rejected, polls cannot revert.
	if (existing.status !== "pending" && !updates.status) {
		const safeUpdates: Partial<AsyncAuthRequestData> = {
			lastPolledAt: updates.lastPolledAt,
			pollingInterval: updates.pollingInterval,
		};
		const updated: AsyncAuthRequestData = { ...existing, ...safeUpdates };
		await writeRequest(ctx, key, updated);
		return updated;
	}

	const updated: AsyncAuthRequestData = { ...existing, ...updates };
	await writeRequest(ctx, key, updated);

	// For status transitions, verify the write wasn't clobbered by a concurrent poll.
	if (updates.status && updates.status !== existing.status) {
		const verification = await findAsyncAuthRequest(ctx, authReqId);
		if (verification && verification.status !== updates.status) {
			// Concurrent poll overwrote us — re-apply the status transition.
			const retried: AsyncAuthRequestData = { ...verification, ...updates };
			await writeRequest(ctx, key, retried);
			return retried;
		}
	}

	return updated;
}

/**
 * Delete an async auth request.
 * Called after tokens are issued or request is denied/expired.
 */
export async function deleteAsyncAuthRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<void> {
	const key = getStorageKey(authReqId);

	if (ctx.context.secondaryStorage) {
		await ctx.context.secondaryStorage.delete(key);
	} else {
		await ctx.context.internalAdapter
			.deleteVerificationByIdentifier(key)
			.catch(() => {});
	}
}
