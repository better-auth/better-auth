import type { Session, User } from "../db";
import type {
	AuthContext,
	FinalizedSignIn,
	SignInAttemptWithUser,
} from "../types/context";

/**
 * Internal writer surface for `AuthContext`. Five first-party sites publish
 * request-scoped auth state through these writers: the session-cookie helper,
 * the `finalizeSignIn` seam, the `resolveSignIn` seam, the 2FA challenge
 * pause/consume path, and the device-authorization session-adoption path.
 *
 * Plugin authors do not import from this path. The public `AuthContext`
 * type exposes only the corresponding `get*` readers; a plugin that tries
 * to reach for a writer on `ctx.context` gets a TypeScript error.
 *
 * @internal
 */
export interface AuthContextWriters {
	setIssuedSession(
		value: {
			session: Session & Record<string, any>;
			user: User & Record<string, any>;
		} | null,
	): void;
	setFinalizedSignIn(value: FinalizedSignIn | null): void;
	setSignInAttempt(value: SignInAttemptWithUser | null): void;
}

/**
 * Returns the internal writer surface attached to an `AuthContext`.
 *
 * The writers are always present at runtime (constructed inside
 * `createAuthContext`). This helper narrows the type so legitimate writer
 * sites call them without a locally-scoped cast. Plugin code must not
 * import from this path.
 *
 * @internal
 */
export function writers(ctx: AuthContext): AuthContextWriters {
	return ctx as unknown as AuthContextWriters;
}
