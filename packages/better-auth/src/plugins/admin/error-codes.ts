import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ADMIN_ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when an admin attempts to create a new user but the operation fails due to database constraints, validation errors, or other system issues.
	 *
	 * ## Common Causes
	 *
	 * - Database connection issues
	 * - Invalid user data provided
	 * - Missing required fields in the user creation request
	 * - Duplicate email or username constraints
	 *
	 * ## How to resolve
	 *
	 * - Verify all required user fields are provided
	 * - Check database connectivity and permissions
	 * - Ensure the email/username is unique
	 * - Review server logs for specific error details
	 */
	FAILED_TO_CREATE_USER: "Failed to create user",
	/**
	 * @description Returned when attempting to create a user with an email that already exists in the system.
	 *
	 * ## Common Causes
	 *
	 * - Admin tries to create a user with an existing email address
	 * - Race condition where multiple create requests happen simultaneously
	 *
	 * ## How to resolve
	 *
	 * - Check if the user already exists before creating
	 * - Use a different email address
	 * - Consider updating the existing user instead
	 */
	USER_ALREADY_EXISTS: "User already exists.",
	/**
	 * @description Returned when attempting to create a user with an email that already exists in the system, with a suggestion to use another email.
	 *
	 * ## Common Causes
	 *
	 * - Admin tries to create a user with an existing email address
	 * - Duplicate user creation request
	 *
	 * ## How to resolve
	 *
	 * - Use a different email address
	 * - Check if the user already exists before attempting to create
	 */
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"User already exists. Use another email.",
	/**
	 * @description This error prevents an admin from banning their own account, which would lock them out of the system.
	 *
	 * ## Common Causes
	 *
	 * - Admin attempts to ban themselves through the user management interface
	 * - Automated script tries to ban all users including the current admin
	 *
	 * ## How to resolve
	 *
	 * - Have another admin ban your account if needed
	 * - Use a different admin account to perform the ban operation
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // This will throw an error if userId matches the current admin
	 * await adminClient.user.ban({ userId: currentAdminId });
	 * ```
	 */
	YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
	/**
	 * @description This error occurs when an admin lacks the necessary permissions to modify user roles in the system.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have role management permissions
	 * - Attempting to assign a role higher than the admin's own role
	 * - Role management feature is restricted to super admins only
	 *
	 * ## How to resolve
	 *
	 * - Contact a super admin to grant you role management permissions
	 * - Verify your admin role has the correct permissions configured
	 * - Check the permission configuration in your Better Auth setup
	 */
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"You are not allowed to change users role",
	/**
	 * @description This error occurs when an admin attempts to create a user but lacks the necessary permissions to do so.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have user creation permissions
	 * - User creation is restricted to specific admin roles
	 * - Permission configuration doesn't include the create users capability
	 *
	 * ## How to resolve
	 *
	 * - Request user creation permissions from a super admin
	 * - Verify your role's permission settings
	 * - Check if user creation is limited to specific admin tiers
	 */
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users",
	/**
	 * @description This error occurs when an admin attempts to view the user list but lacks the necessary permissions.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have user listing permissions
	 * - Insufficient privilege level for viewing user data
	 * - Permission configuration doesn't include the list users capability
	 *
	 * ## How to resolve
	 *
	 * - Request user listing permissions from a super admin
	 * - Verify your role includes user viewing capabilities
	 * - Check the admin panel permission settings
	 */
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users",
	/**
	 * @description This error occurs when an admin attempts to view user sessions but lacks the necessary permissions.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have session viewing permissions
	 * - Session management is restricted to higher privilege levels
	 * - Privacy policy restrictions on session data access
	 *
	 * ## How to resolve
	 *
	 * - Request session viewing permissions from a super admin
	 * - Verify your role includes session management capabilities
	 * - Check if this operation requires elevated privileges
	 */
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"You are not allowed to list users sessions",
	/**
	 * @description This error occurs when an admin attempts to ban a user but lacks the necessary permissions.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have user ban permissions
	 * - User moderation capabilities are restricted to specific roles
	 * - Attempting to ban a user with equal or higher privileges
	 *
	 * ## How to resolve
	 *
	 * - Request user ban permissions from a super admin
	 * - Verify your role includes moderation capabilities
	 * - Ensure you have appropriate privilege level for user moderation
	 */
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users",
	/**
	 * @description This error occurs when an admin attempts to impersonate another user but lacks the necessary permissions. User impersonation is a sensitive operation that allows admins to view the application as another user.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have impersonation permissions
	 * - Impersonation is restricted to super admins only
	 * - Attempting to impersonate a user with equal or higher privileges
	 *
	 * ## How to resolve
	 *
	 * - Request impersonation permissions from a super admin
	 * - Verify this feature is enabled in your Better Auth configuration
	 * - Ensure you have the highest privilege level required for this operation
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Impersonation requires specific permissions
	 * await adminClient.user.impersonate({ userId: targetUserId });
	 * ```
	 */
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"You are not allowed to impersonate users",
	/**
	 * @description This error occurs when an admin attempts to revoke user sessions but lacks the necessary permissions.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have session management permissions
	 * - Session revocation is restricted to specific admin roles
	 * - Attempting to revoke sessions for users with higher privileges
	 *
	 * ## How to resolve
	 *
	 * - Request session management permissions from a super admin
	 * - Verify your role includes session control capabilities
	 * - Check if this operation requires elevated privileges
	 */
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"You are not allowed to revoke users sessions",
	/**
	 * @description This error occurs when an admin attempts to delete a user account but lacks the necessary permissions. User deletion is a destructive operation that permanently removes user data.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have user deletion permissions
	 * - User deletion is restricted to super admins only
	 * - Attempting to delete a user with equal or higher privileges
	 *
	 * ## How to resolve
	 *
	 * - Request user deletion permissions from a super admin
	 * - Verify your role includes account deletion capabilities
	 * - Ensure you have appropriate privilege level for this destructive operation
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // User deletion requires highest level permissions
	 * await adminClient.user.delete({ userId: targetUserId });
	 * ```
	 */
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users",
	/**
	 * @description This error occurs when an admin attempts to set or reset a user's password but lacks the necessary permissions. Password management is a sensitive security operation.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have password management permissions
	 * - Password changes are restricted to specific admin roles
	 * - Attempting to change passwords for users with higher privileges
	 *
	 * ## How to resolve
	 *
	 * - Request password management permissions from a super admin
	 * - Verify your role includes password modification capabilities
	 * - Ensure users reset their own passwords through proper channels if you lack permissions
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Setting user password requires specific permissions
	 * await adminClient.user.setPassword({ userId: targetUserId, password: newPassword });
	 * ```
	 */
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"You are not allowed to set users password",
	/**
	 * @description This error is returned when a banned user attempts to access the application or perform any operations.
	 *
	 * ## Common Causes
	 *
	 * - User account has been banned by an administrator
	 * - Account violated terms of service or community guidelines
	 * - Security concerns led to account suspension
	 *
	 * ## How to resolve
	 *
	 * - Contact application support to understand the reason for the ban
	 * - Appeal the ban if you believe it was issued in error
	 * - Wait for the ban duration to expire if it's temporary
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Attempting any operation while banned will trigger this error
	 * await client.auth.signIn({ email, password }); // Throws BANNED_USER
	 * ```
	 */
	BANNED_USER: "You have been banned from this application",
	/**
	 * @description This error occurs when an admin attempts to retrieve user information but lacks the necessary permissions.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have user viewing permissions
	 * - Attempting to view details of users with higher privileges
	 * - Insufficient privilege level for accessing user data
	 *
	 * ## How to resolve
	 *
	 * - Request user viewing permissions from a super admin
	 * - Verify your role includes user data access capabilities
	 * - Check if specific users are restricted from your view
	 */
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user",
	/**
	 * @description This error occurs when an admin attempts to update a user but provides no fields to update.
	 *
	 * ## Common Causes
	 *
	 * - Update request sent with empty data object
	 * - All provided fields are identical to current values
	 * - Request body is missing or malformed
	 *
	 * ## How to resolve
	 *
	 * - Ensure at least one field is provided in the update request
	 * - Verify the request includes valid data to change
	 * - Check that the update payload is properly formatted
	 */
	NO_DATA_TO_UPDATE: "No data to update",
	/**
	 * @description This error occurs when an admin attempts to update user information but lacks the necessary permissions.
	 *
	 * ## Common Causes
	 *
	 * - Admin account doesn't have user update permissions
	 * - Attempting to update users with equal or higher privileges
	 * - User modification is restricted to specific admin roles
	 *
	 * ## How to resolve
	 *
	 * - Request user update permissions from a super admin
	 * - Verify your role includes user modification capabilities
	 * - Check if specific users are restricted from your modifications
	 */
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users",
	/**
	 * @description This error prevents an admin from deleting their own account, which would lock them out of the system.
	 *
	 * ## Common Causes
	 *
	 * - Admin attempts to delete their own user account
	 * - Automated script tries to delete all users including the current admin
	 *
	 * ## How to resolve
	 *
	 * - Have another admin delete your account if needed
	 * - Use a different admin account to perform the deletion
	 * - Ensure you maintain at least one active admin account
	 */
	YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself",
	/**
	 * @description This error occurs when an admin attempts to assign a role that doesn't exist in the system configuration.
	 *
	 * ## Common Causes
	 *
	 * - Attempting to assign an undefined or invalid role
	 * - Typo in the role name or identifier
	 * - Role was removed from configuration but code still references it
	 *
	 * ## How to resolve
	 *
	 * - Verify the role exists in your Better Auth configuration
	 * - Check for typos in the role identifier
	 * - Use only predefined roles from your role configuration
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // Ensure the role is defined in your auth configuration
	 * await adminClient.user.changeRole({ userId, role: "admin" }); // "admin" must exist
	 * ```
	 */
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"You are not allowed to set a non-existent role value",
	/**
	 * @description This error prevents admins from impersonating other admin accounts, which is a security restriction to prevent privilege escalation.
	 *
	 * ## Common Causes
	 *
	 * - Attempting to impersonate another admin user
	 * - Trying to access another admin's account for troubleshooting
	 * - Security policy prevents admin-to-admin impersonation
	 *
	 * ## How to resolve
	 *
	 * - Impersonate only non-admin users
	 * - Use proper admin account switching mechanisms if available
	 * - Contact super admins if you need to troubleshoot admin-specific issues
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // This will fail if targetUser has admin role
	 * await adminClient.user.impersonate({ userId: adminUserId });
	 * ```
	 */
	YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins",
	/**
	 * @description This error occurs when an invalid role type is provided in a role-related operation.
	 *
	 * ## Common Causes
	 *
	 * - Role value is not a string or expected type
	 * - Role parameter is undefined or null
	 * - Malformed role data in the request
	 *
	 * ## How to resolve
	 *
	 * - Ensure role is provided as a valid string
	 * - Check that the role parameter is properly formatted
	 * - Verify the role matches the expected type in your configuration
	 */
	INVALID_ROLE_TYPE: "Invalid role type",
});
