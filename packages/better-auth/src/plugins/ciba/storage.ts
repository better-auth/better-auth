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
 * Find a CIBA request by auth_req_id.
 */
export async function findCibaRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
): Promise<CibaRequestData | null> {
	const key = getStorageKey(authReqId);

	if (ctx.context.secondaryStorage) {
		const value = await ctx.context.secondaryStorage.get(key);
		if (!value) return null;
		return safeJSONParse<CibaRequestData>(value);
	}

	const verification =
		await ctx.context.internalAdapter.findVerificationValue(key);
	if (!verification) return null;

	if (verification.expiresAt < new Date()) {
		await ctx.context.internalAdapter.deleteVerificationValue(verification.id);
		return null;
	}

	return safeJSONParse<CibaRequestData>(verification.value);
}

/**
 * Update a CIBA request.
 * Used for:
 * - Updating `lastPolledAt` when agent polls (rate limiting)
 * - Updating `status` to "approved" or "denied" when user responds
 */
export async function updateCibaRequest(
	ctx: GenericEndpointContext,
	authReqId: string,
	updates: Partial<CibaRequestData>,
): Promise<CibaRequestData | null> {
	const existing = await findCibaRequest(ctx, authReqId);
	if (!existing) return null;

	const updated: CibaRequestData = { ...existing, ...updates };
	const key = getStorageKey(authReqId);
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
