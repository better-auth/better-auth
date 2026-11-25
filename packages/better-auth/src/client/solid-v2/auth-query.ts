import type { BetterFetchError } from "@better-fetch/fetch";
import type { Accessor, FromSource } from "solid-js";
import { action, affects, createMemo, from } from "solid-js";
import type { AuthQueryAtom, AuthQueryState } from "../query";
import type { SessionQueryParams } from "../types";

/**
 * Optional query parameters forwarded to an auth query's refetch.
 */
export type AuthQueryRefetchParams = { query?: SessionQueryParams };

/**
 * An async accessor over a Better Auth query (the session, the active
 * organization, …).
 *
 * - Calling it returns the data, or `null` when there is none (for the
 *   session: signed out). Before the first answer the read suspends to the
 *   nearest `<Loading>` boundary.
 * - A request that fails before the query's first answer throws to the
 *   nearest `<Errored>` boundary; resetting the boundary retries the request.
 *   After an answer (data or `null`), a failed request keeps that answer.
 * - `refetch()` re-requests the data; `isPending(() => accessor())` is `true`
 *   until it settles. The promise always resolves: a failed request shows up
 *   as the previous answer being kept, never as a rejection.
 */
export type AuthQueryAccessor<T> = Accessor<T | null> & {
	refetch: (queryParams?: AuthQueryRefetchParams) => Promise<void>;
};

/**
 * Options for {@link createAuthQueryAccessor}.
 */
export type AuthQueryAccessorOptions<T> = {
	/**
	 * The value to render on the server, usually the request's session read
	 * by a server function or route data. Without it the server renders
	 * `null`. Ignored in the browser, which adopts the server's answer during
	 * hydration and then follows the client's own request.
	 */
	serverValue?: Accessor<T | null> | undefined;
};

const isServer = () => typeof window === "undefined";

/**
 * On the server the client is a module-level singleton with no request
 * context, so it never fetches. A source that stayed pending would hold a
 * streaming render open; answering once lets the render settle.
 */
function serverSource<T>(value: T | null): FromSource<T | null> {
	return (next) => {
		next(value);
	};
}

type AuthQueryOutcome<T> =
	| { kind: "pending" }
	| { kind: "value"; value: T | null }
	| { kind: "error"; error: BetterFetchError };

function toOutcome<T>(state: AuthQueryState<T>): AuthQueryOutcome<T> {
	// A 401 means there is nothing to show (signed out), not a failure.
	if (state.error?.status === 401) {
		return { kind: "value", value: null };
	}
	if (state.error && state.data === null) {
		return { kind: "error", error: state.error };
	}
	if (state.isPending && state.data === null) {
		return { kind: "pending" };
	}
	return { kind: "value", value: state.data };
}

function authQuerySource<T>(store: AuthQueryAtom<T>): FromSource<T | null> {
	return (next, error) => {
		// Subscribing while the query is already failed means an `<Errored>`
		// boundary is retrying: re-request instead of re-throwing the old error.
		let isRetry = toOutcome(store.get()).kind === "error";
		if (isRetry) {
			void store.get().refetch();
		}
		// Once the query has answered (data or `null`), a later failed request
		// keeps showing that answer: only a failure before any answer reaches
		// `<Errored>`. Erroring here would also close the subscription.
		let hasAnswered = false;
		return store.subscribe((state) => {
			const outcome = toOutcome(state);
			const skipStaleError = isRetry && outcome.kind === "error";
			isRetry = false;
			if (skipStaleError) {
				return;
			}
			switch (outcome.kind) {
				case "value":
					hasAnswered = true;
					next(outcome.value);
					return;
				case "error":
					if (!hasAnswered) {
						error(outcome.error);
					}
					return;
				case "pending":
					return;
			}
		});
	};
}

/**
 * Bridges a Better Auth query atom into Solid 2's async model.
 *
 * Call it in a component body or another primitive: the subscription belongs
 * to the current owner and is released with it.
 *
 * @param store - An auth-query atom created by `useAuthQuery` or the session atom.
 * @param options - See {@link AuthQueryAccessorOptions}.
 * @returns An async accessor with a `refetch` action.
 */
function createAuthQueryAccessor<T>(
	store: AuthQueryAtom<T>,
	options: AuthQueryAccessorOptions<T> = {},
): AuthQueryAccessor<T> {
	const data = createMemo(() => {
		if (isServer()) {
			return from(serverSource(options.serverValue?.() ?? null));
		}
		return from(authQuerySource(store));
	});
	const refetch = action(function* (queryParams?: AuthQueryRefetchParams) {
		affects(data);
		yield store.get().refetch(queryParams);
	});
	const accessor: Accessor<T | null> = () => data();
	return Object.assign(accessor, { refetch });
}

/**
 * Creates the `use*` hook for an auth-query atom.
 *
 * @param store - The auth-query atom.
 * @returns A hook that accepts an optional server value.
 */
export function createAuthQueryHook<T>(store: AuthQueryAtom<T>) {
	return (serverValue?: Accessor<T | null>): AuthQueryAccessor<T> =>
		createAuthQueryAccessor(store, { serverValue });
}
