import { defineRequestState } from "@better-auth/core/context";

/**
 * Tokens of request sessions that a plugin built without a session-store
 * row, such as one authenticated by an API key on every request.
 */
const { get: getTokensOutsideStore } = defineRequestState<Set<string>>(
	() => new Set(),
);

/**
 * Marks the request session with `token` as built without a session-store
 * row. Checks that re-read the store to catch a concurrent revocation skip
 * such sessions.
 *
 * @internal Shared by Better Auth packages; not a supported public API.
 */
export async function markSessionOutsideStore(token: string) {
	const tokens = await getTokensOutsideStore();
	tokens.add(token);
}

/**
 * Whether the request session with `token` was marked by
 * `markSessionOutsideStore`. Outside a request, nothing is marked.
 *
 * @internal Shared by Better Auth packages; not a supported public API.
 */
export async function isSessionOutsideStore(token: string) {
	const tokens = await getTokensOutsideStore().catch(() => null);
	return tokens?.has(token) ?? false;
}
