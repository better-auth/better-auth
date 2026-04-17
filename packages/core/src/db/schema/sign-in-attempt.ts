import * as z from "zod";
import { coreSchema } from "./shared";

export const signInAttemptSchema = coreSchema.extend({
	userId: z.coerce.string(),
	expiresAt: z.date(),
	dontRememberMe: z.boolean().nullish(),
	/**
	 * Primary factor used to initiate the sign-in (e.g. "email", "google",
	 * "magic-link"). Populated after the primary factor resolves so the
	 * downstream finalize path (after 2FA) can recover the original method.
	 */
	loginMethod: z.string().nullish(),
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
