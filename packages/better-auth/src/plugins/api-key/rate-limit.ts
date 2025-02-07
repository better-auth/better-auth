import { ERROR_CODES, type ApiKey } from ".";
import type { Adapter, Where } from "../../types";

export async function updateRateLimit(
	adapter: Adapter,
	model: string,
	currentRecord: ApiKey,
	whereClause: Where[],
): Promise<{ success: boolean; message: string | null }> {
	if (currentRecord.rateLimitEnabled === false)
		return { success: true, message: null };

	const now = new Date();
	const windowStart = new Date(
		now.getTime() - currentRecord.rateLimitTimeWindow,
	);

	if (currentRecord) {
		const { requestCount, lastRequest } = currentRecord;

		// Check if the last request was within the time window
		if (lastRequest < windowStart) {
			// Reset the count if outside the window
			await adapter.update<ApiKey>({
				model: model,
				where: whereClause,
				update: {
					requestCount: 1,
					lastRequest: now,
				},
			});
			return { success: true, message: null }; // Allowed
		}

		if (requestCount < currentRecord.rateLimitCount) {
			// Increment the count if within the window
			await adapter.update<ApiKey>({
				model: model,
				where: whereClause,
				update: {
					requestCount: requestCount + 1,
					lastRequest: now,
				},
			});
			return { success: true, message: null }; // Allowed
		}
		return { success: false, message: ERROR_CODES.RATE_LIMIT_EXCEEDED }; // Rate limit exceeded
	} else {
		// If no record exists

		return { success: true, message: null }; // Allowed
	}
}
