import { defineRequestState } from "@better-auth/core/context";

/**
 * State for skipping session refresh
 *
 * In some cases, such as when using server-side rendering (SSR) or when dealing with
 * certain types of requests, it may be necessary to skip session refresh to prevent
 * potential inconsistencies between the session data in the database and the session
 * data stored in cookies.
 */
const { get: getShouldSkipSessionRefresh, set: setShouldSkipSessionRefresh } =
	defineRequestState<boolean | null>(() => false);

export { getShouldSkipSessionRefresh, setShouldSkipSessionRefresh };
