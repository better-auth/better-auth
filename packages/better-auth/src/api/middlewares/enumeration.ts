import {
	defineRequestState,
	getCurrentAuthContext,
} from "@better-auth/core/context";
import { isDevelopment } from "@better-auth/core/env";

/**
 * Request state for storing enumeration-safe response.
 * When set, this response will be returned instead of errors that could leak user existence.
 */
const enumerationSafeResponseState = defineRequestState<unknown | null>(
	() => null,
);

export const {
	get: getEnumerationSafeResponse,
	set: __setEnumerationSafeResponse,
} = enumerationSafeResponseState;

/**
 * Check if enumeration protection is enabled based on config and environment.
 */
async function isEnumerationProtectionEnabled(): Promise<boolean> {
	const context = await getCurrentAuthContext();
	const configValue =
		context.context.options.advanced?.security?.preventEnumeration;
	// Default: enabled in production, disabled in development
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
 * @param timingFn - Optional async function to run for timing attack prevention (e.g., password hashing)
 *
 * @example
 * ```ts
 * // In an endpoint handler:
 * const user = await findUserByEmail(email);
 * if (!user) {
 *   await setEnumerationSafeResponse(
 *     { token: null, user: null },
 *     async () => {
 *       // Hash password to prevent timing attacks
 *       await ctx.context.password.hash(password);
 *     }
 *   );
 *   throw APIError.from("...", USER_NOT_FOUND);
 * }
 * ```
 */
export async function setEnumerationSafeResponse(
	response: unknown,
	timingFn?: () => Promise<void>,
): Promise<void> {
	if (!(await isEnumerationProtectionEnabled())) {
		return;
	}

	// Run timing function to prevent timing attacks
	if (timingFn) {
		await timingFn();
	}

	await __setEnumerationSafeResponse(response);
}
