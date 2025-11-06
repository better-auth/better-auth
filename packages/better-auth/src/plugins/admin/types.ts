import { type InferOptionSchema, type Session, type User } from "../../types";
import { type AccessControl, type Role } from "../access";
import { type AdminSchema } from "./schema";

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
	 * The default role for a user.
	 *
	 * @default "user"
	 * @cli optional
	 * @type string
	 */
	defaultRole?: string | undefined;
	/**
	 * Roles that are considered admin roles.
	 *
	 * Any user role that isn't in this list, even if they have the permission,
	 * will not be considered an admin.
	 *
	 * @default ["admin"]
	 * @cli optional
	 * @type string[]
	 */
	adminRoles?: (string | string[]) | undefined;
	/**
	 * A default ban reason
	 *
	 * By default, no reason is provided
	 *
	 * @cli optional
	 * @type string
	 * @question What is the default ban reason?
	 */
	defaultBanReason?: string | undefined;
	/**
	 * Number of seconds until the ban expires
	 *
	 * By default, the ban never expires
	 * @cli optional
	 * @type number
	 * @question When does the ban expire by default?
	 */
	defaultBanExpiresIn?: number | undefined;
	/**
	 * Duration of the impersonation session in seconds
	 *
	 * By default, the impersonation session lasts 1 hour
	 * @cli optional
	 * @type number
	 * @question How long does the impersonation session last by default?
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
	 *
	 * @cli optional
	 * @type string[]
	 * @question What are the user ids that should have hard-coded admin access?
	 */
	adminUserIds?: string[] | undefined;
	/**
	 * Message to show when a user is banned
	 *
	 * By default, the message is "You have been banned from this application"
	 *
	 * @cli optional
	 * @type string
	 * @question What is the message to show when a user is banned?
	 */
	bannedUserMessage?: string | undefined;
}

export type InferAdminRolesFromOption<O extends AdminOptions | undefined> =
	O extends { roles: Record<string, unknown> }
		? keyof O["roles"]
		: "user" | "admin";
