import type { DBFieldAttribute } from "@better-auth/core/db";
import type { Session, User } from "../../types";
import type { AccessControl, Role } from "../access";
import type { AdminSessionFields, AdminUserFields, UserRole } from "./schema";

export interface UserWithRole extends User, AdminUserFields {}

export interface SessionWithImpersonatedBy
	extends Session,
		AdminSessionFields {}

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
	schema?:
		| {
				user?:
					| {
							fields?:
								| {
										[key in keyof AdminUserFields]?: string | undefined;
								  }
								| undefined;
					  }
					| undefined;
				session?:
					| {
							fields?:
								| {
										[key in keyof AdminSessionFields]?: string | undefined;
								  }
								| undefined;
					  }
					| undefined;
				role?: {
					modelName?: string;
					fields?:
						| {
								[key in keyof Omit<UserRole, "id">]?: string;
						  }
						| undefined;
					additionalFields?: {
						[key in string]: DBFieldAttribute;
					};
				};
		  }
		| undefined;
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
	 * Dynamic access control for the admin plugin.
	 */
	dynamicAccessControl?:
		| {
				/**
				 * Whether to enable dynamic access control for the admin plugin.
				 *
				 * @default false
				 */
				enabled?: boolean | undefined;
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
	 * Whether to allow impersonating other admins
	 *
	 * @default false
	 */
	allowImpersonatingAdmins?: boolean | undefined;
}

export type InferAdminRolesFromOption<O extends AdminOptions | undefined> =
	O extends { roles: Record<string, unknown> }
		? keyof O["roles"]
		: "user" | "admin";
