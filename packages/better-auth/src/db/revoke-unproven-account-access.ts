import type { GenericEndpointContext } from "@better-auth/core";

/**
 * Strip every credential and session a pre-existing account accrued before
 * control of its email was proven.
 *
 * An `emailVerified: false` row carries no proof that the password on it belongs
 * to the mailbox owner. When an email-primary proof (magic link, email OTP)
 * resolves to such a row, deleting the `credential` account and revoking standing
 * sessions makes the verified owner inherit no password or session that predates
 * the proof. Call this before flipping `emailVerified` and minting the owner's
 * session; it no-ops if a concurrent flow has already verified the account.
 *
 * @param userId - The pre-existing, not-yet-verified user being promoted.
 */
export async function revokeUnprovenAccountAccess(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<void> {
	// Re-read so the strip sees current state, not the caller's earlier check.
	// FIXME: re-read and strip are not atomic and span the DB and secondary session
	// store, so a verify-email landing in this window can clear a just-confirmed
	// password (recoverable by reset, never a security loss). A durable fix needs
	// cross-store reconciliation.
	const user = await ctx.context.internalAdapter.findUserById(userId);
	if (!user || user.emailVerified) {
		return;
	}
	const accounts = await ctx.context.internalAdapter.findAccounts(userId);
	for (const account of accounts) {
		if (account.providerId === "credential") {
			await ctx.context.internalAdapter.deleteAccount(account.id);
		}
	}
	await ctx.context.internalAdapter.deleteUserSessions(userId);
}
