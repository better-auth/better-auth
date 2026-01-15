import {
	defineRequestState,
	getCurrentAuthContext,
} from "@better-auth/core/context";
import { isDevelopment } from "../env";

/**
 * Request state for storing enumeration-safe response and timing function.
 * When set, this response will be returned instead of errors that could leak user existence.
 */
type EnumerationSafeState = {
	response: unknown;
	timingFn?: () => Promise<unknown>;
} | null;

const { get: getEnumerationSafeState, set: setEnumerationSafeState } =
	defineRequestState<EnumerationSafeState>(() => null);

/**
 * Get the enumeration-safe response if one was set.
 *
 * @internal
 */
export async function getEnumerationSafeResponse(): Promise<unknown | null> {
	const state = await getEnumerationSafeState();
	return state?.response ?? null;
}

/**
 * Get the timing function if one was set.
 *
 * @internal
 */
export async function getEnumerationSafeTimingFn(): Promise<
	(() => Promise<unknown>) | null
> {
	const state = await getEnumerationSafeState();
	return state?.timingFn ?? null;
}

/**
 * Check if enumeration protection is enabled based on config and environment.
 * Default: enabled in production, disabled in development.
 */
async function isEnumerationProtectionEnabled(): Promise<boolean> {
	const context = await getCurrentAuthContext();
	const configValue =
		context.context.options.advanced?.security?.preventEnumeration;
	if (configValue === undefined) {
		return !isDevelopment();
	}
	return configValue;
}

/**
 * Set an enumeration-safe response to be returned instead of an error.
 * Call this before throwing an error that could leak user existence.
 * The response will be automatically returned by toAuthEndpoints when an error is thrown.
 *
 * @param response - The fake response to return instead of the error
 * @param timingFn - Optional async function to run for timing attack prevention (e.g., password hashing).
 *                   This function will be executed in toAuthEndpoints right before returning the safe response.
 *
 * @example
 * ```ts
 * const user = await findUserByEmail(email);
 * if (!user) {
 *   await setEnumerationSafeResponse(
 *     { token: null, user: null },
 *     () => ctx.context.password.hash(password)
 *   );
 *   throw APIError.from("...", USER_NOT_FOUND);
 * }
 * ```
 */
export async function setEnumerationSafeResponse(
	response: unknown,
	timingFn?: () => Promise<unknown>,
): Promise<void> {
	const isEnabled = await isEnumerationProtectionEnabled();
	if (!isEnabled) {
		return;
	}

	await setEnumerationSafeState({
		response,
		timingFn,
	});
}
