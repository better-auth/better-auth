import type { BetterAuthOptions } from "../types/options";
/**
 * Normalizes an email address by converting to lowercase and optionally
 * removing subaddressing (+ aliases)
 */
export function normalizeEmail(
	email: string,
	options?: Pick<BetterAuthOptions, "user">,
): string {
	const lowercased = email.toLowerCase();

	if (!options?.user?.normalizeEmailSubaddressing) {
		return lowercased;
	}

	// Remove subaddressing (+ and everything after until @)
	const atIndex = lowercased.indexOf("@");
	if (atIndex === -1) return lowercased;

	const localPart = lowercased.substring(0, atIndex);
	const domain = lowercased.substring(atIndex);

	const plusIndex = localPart.indexOf("+");
	if (plusIndex === -1) return lowercased;

	return localPart.substring(0, plusIndex) + domain;
}
