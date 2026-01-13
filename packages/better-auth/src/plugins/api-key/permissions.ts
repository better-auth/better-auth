import type { Statements } from "../access";

/**
 * Validates that the requested permissions are within the allowed client permissions.
 *
 * @param requestedPermissions - The permissions the client is trying to set
 * @param allowedPermissions - The permissions that are allowed to be set from the client
 *   - If `true`, all permissions are allowed
 *   - If `Statements`, only permissions that are a subset are allowed
 * @returns `true` if the permissions are valid, `false` otherwise
 */
export function validateClientPermissions(
	requestedPermissions: { [key: string]: string[] },
	allowedPermissions: Statements | true,
): boolean {
	// If true, all permissions are allowed
	if (allowedPermissions === true) {
		return true;
	}

	// Check each resource and action in the requested permissions
	for (const resource of Object.keys(requestedPermissions)) {
		const allowedActions = allowedPermissions[resource];

		// Resource not in allowed list
		if (!allowedActions) {
			return false;
		}

		const requestedActions = requestedPermissions[resource];

		// Check each requested action is in the allowed list
		for (const action of requestedActions) {
			if (!allowedActions.includes(action)) {
				return false;
			}
		}
	}

	return true;
}
