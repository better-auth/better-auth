import type { InferOptionSchema, Session, User } from "../../types";
import type { AccessControl, Role } from "../access";
import type { AdminSchema } from "./schema";

export interface UserWithRole extends User {
	role?: string | undefined;
	banned: boolean | null;
	banReason?: (string | null) | undefined;
	banExpires?: (Date | null) | undefined;
}

export interface SessionWithImpersonatedBy extends Session {
	impersonatedBy?: string | undefined;
}

export interface AdminOptions {
	/**
	 * The default role for a user
	 *
	 * @default "user"
	 */
	defaultRole?: string | undefined;
	/**
	 * Roles that are considered admin roles.
	 *
	 * Any user role that isn't in this list, even if they have the permission,
	 * will not be considered an admin.
	 *
	 * @default ["admin"]
	 */
	adminRoles?: (string | string[]) | undefined;
	/**
	 * A default ban reason
	 *
	 * By default, no reason is provided
	 */
	defaultBanReason?: string | undefined;
	/**
	 * Number of seconds until the ban expires
	 *
	 * By default, the ban never expires
	 */
	defaultBanExpiresIn?: number | undefined;
	/**
	 * Duration of the impersonation session in seconds
	 *
	 * By default, the impersonation session lasts 1 hour
	 */
	impersonationSessionDuration?: number | undefined;
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<AdminSchema> | undefined;
	/**
	 * Configure the roles and permissions for the admin
	 * plugin.
	 */
	ac?: AccessControl | undefined;
	/**
	 * Custom permissions for roles.
	 */
	roles?:
		| {
				[key in string]?: Role;
		  }
		| undefined;
	/**
	 * List of user ids that should have admin access
	 *
	 * If this is set, the `adminRole` option is ignored
	 */
	adminUserIds?: string[] | undefined;
	/**
	 * Message to show when a user is banned
	 *
	 * By default, the message is "You have been banned from this application"
	 */
	bannedUserMessage?: string | undefined;
	/**
	 * Whether to allow impersonating other admins.
	 *
	 * @deprecated Use the `impersonate-admins` permission instead.
	 *
	 * @default false
	 */
	allowImpersonatingAdmins?: boolean | undefined;
	/**
	 * Lifecycle hooks for admin user operations.
	 */
	hooks?:
		| {
				/**
				 * Called before a user is deleted via the admin `removeUser` endpoint.
				 * Throw an `APIError` (or any error) to abort the deletion.
				 *
				 * @param user - The user record about to be deleted.
				 */
				beforeRemoveUser?: (
					user: User & Record<string, any>,
				) => Promise<void> | void;
				/**
				 * Called after a user has been successfully deleted via the admin
				 * `removeUser` endpoint.
				 *
				 * @param user - The user record that was deleted.
				 */
				afterRemoveUser?: (
					user: User & Record<string, unknown>,
				) => Promise<void> | void;
		  }
		| undefined;
}

export type InferAdminRolesFromOption<O extends AdminOptions | undefined> =
	O extends { roles: Record<string, unknown> }
		? keyof O["roles"]
		: "user" | "admin";
