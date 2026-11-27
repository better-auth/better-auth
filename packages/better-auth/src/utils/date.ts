import type { BetterAuthOptions } from "@better-auth/core";

/**
 * Latest time in ms a session created at `createdAt` may stay valid under
 * `session.absoluteExpiresIn`, or `Infinity` when no absolute lifetime is set.
 * Cookie-cached sessions carry `createdAt` as a JSON string.
 */
export const getSessionExpiryLimit = (
	options: BetterAuthOptions,
	createdAt: Date | string,
) => {
	const absoluteExpiresIn = options.session?.absoluteExpiresIn;
	return absoluteExpiresIn
		? new Date(createdAt).getTime() + absoluteExpiresIn * 1000
		: Infinity;
};

/**
 * Caps `expiresAt` at the session's absolute lifetime.
 */
export const capSessionExpiresAt = (
	options: BetterAuthOptions,
	createdAt: Date | string,
	expiresAt: Date,
) =>
	new Date(
		Math.min(expiresAt.getTime(), getSessionExpiryLimit(options, createdAt)),
	);

export const getDate = (span: number, unit: "sec" | "ms" = "ms") => {
	return new Date(Date.now() + (unit === "sec" ? span * 1000 : span));
};
