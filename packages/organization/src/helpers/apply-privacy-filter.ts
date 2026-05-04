import type { ResolvedPrivacyOptions } from "../types";

/**
 * Applies privacy filtering to member user data by removing specified fields.
 */
export function applyMemberPrivacyFilter<
	T extends { email?: string; name?: string | null; image?: string | null },
>(data: T, privacy: ResolvedPrivacyOptions): T {
	if (!privacy.enabled || privacy.hiddenMemberFields.length === 0) {
		return data;
	}

	const result = { ...data };
	for (const field of privacy.hiddenMemberFields) {
		if (field in result) {
			delete (result as Record<string, unknown>)[field];
		}
	}
	return result;
}

/**
 * Applies privacy filtering to invitation data by removing specified fields.
 */
export function applyInvitationPrivacyFilter<
	T extends { email?: string } | null,
>(data: T, privacy: ResolvedPrivacyOptions): T {
	if (data === null) {
		return data;
	}
	if (!privacy.enabled || privacy.hiddenInvitationFields.length === 0) {
		return data;
	}

	const result = { ...data };
	for (const field of privacy.hiddenInvitationFields) {
		if (field in result) {
			delete (result as Record<string, unknown>)[field];
		}
	}
	return result as T;
}
