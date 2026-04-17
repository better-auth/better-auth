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
});

export type BaseSignInAttempt = z.infer<typeof signInAttemptSchema>;

export type SignInAttempt = BaseSignInAttempt;
