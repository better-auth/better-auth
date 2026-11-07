import type { AuthContext, Awaitable } from "@better-auth/core";

/**
 * Every shape an endpoint builder accepts for its auth context.
 *
 * A function stands for a context that each call joins afresh, so a caller
 * that bounds the wait rebuilds that bound inside the request doing the
 * waiting.
 */
export type AuthContextSource =
	| Awaitable<AuthContext>
	| (() => Promise<AuthContext>);

/**
 * Resolves an {@link AuthContextSource}. The single place that knows how each
 * shape turns into a context, so a new shape cannot be missed at a call site.
 */
export const resolveAuthContext = (
	source: AuthContextSource,
): Awaitable<AuthContext> => (typeof source === "function" ? source() : source);
