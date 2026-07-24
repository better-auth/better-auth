import {
	defineRequestState,
	type RequestState,
} from "@better-auth/core/context";

/**
 * State for skipping session refresh
 *
 * In some cases, such as when using server-side rendering (SSR) or when dealing with
 * certain types of requests, it may be necessary to skip session refresh to prevent
 * potential inconsistencies between the session data in the database and the session
 * data stored in cookies.
 */
let state: RequestState<boolean | null> | undefined;

function getShouldSkipSessionRefreshState() {
	state ??= defineRequestState<boolean | null>(() => false);
	return state;
}

const getShouldSkipSessionRefresh = () =>
	getShouldSkipSessionRefreshState().get();
const setShouldSkipSessionRefresh = (value: boolean | null) =>
	getShouldSkipSessionRefreshState().set(value);

export { getShouldSkipSessionRefresh, setShouldSkipSessionRefresh };
