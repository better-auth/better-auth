export const userKeys = {
	all: () => ["user"] as const,
	session: () => [...userKeys.all(), "session"] as const,
	twoFactorMethods: () => [...userKeys.all(), "two-factor", "methods"] as const,
	pendingTwoFactorChallenge: () =>
		[...userKeys.all(), "two-factor", "pending-challenge"] as const,
};
