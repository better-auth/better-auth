import * as z from "zod";
import { amrSchema } from "../../auth/amr-methods";
import { coreSchema } from "./shared";

export const signInAttemptSchema = coreSchema.extend({
	userId: z.coerce.string(),
	expiresAt: z.date(),
	rememberMe: z.boolean().nullish(),
	/**
	 * Authentication methods completed before the attempt was created. The
	 * primary factor (e.g. password, magic-link, an OAuth provider) lives at
	 * `amr[0]`; subsequent factor verifications append on commit. Preserved
	 * across the challenge so the finalized session's `amr` reflects the full
	 * chain, not just the last step.
	 */
	amr: amrSchema.default(() => []),
	/**
	 * Count of failed verification attempts against this attempt. Incremented
	 * on each invalid code; compared against `maxVerificationAttempts` to lock
	 * the attempt out of further verification.
	 */
	failedVerifications: z.number().int().nonnegative().default(0),
	/**
	 * Timestamp at which the attempt was locked out due to exceeding
	 * `maxVerificationAttempts`. Null while still unlocked.
	 */
	lockedAt: z.date().nullish(),
});

export type BaseSignInAttempt = z.infer<typeof signInAttemptSchema>;

export type SignInAttempt = BaseSignInAttempt;
