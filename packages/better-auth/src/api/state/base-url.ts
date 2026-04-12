import { defineRequestState } from "@better-auth/core/context";

/**
 * Resolved `baseURL` scoped to the current request.
 *
 * Written by the outermost `auth.api` invocation (or the HTTP handler) after
 * dynamic resolution so nested calls in the same request inherit the value
 * without re-resolving.
 */
export const {
	get: getResolvedBaseURL,
	/**
	 * @internal Use only from `toAuthEndpoints` after resolving the baseURL.
	 */
	set: setResolvedBaseURL,
} = defineRequestState<string | undefined>(() => undefined);
