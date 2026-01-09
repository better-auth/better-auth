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
	 * Events for the admin plugin
	 */
	events?: {
		/**
		 * A callback when `admin.impersonateUser` is called.
		 */
		impersonateStart: (
			/**
			 * `null` if the request is made from the server
			 */
			adminSession: {
				user: User & Record<string, unknown>;
				session: Session & Record<string, unknown>;
			} | null,
			impersonatedUser: UserWithRole,
		) => Promise<void>;
		/**
		 * A callback when `admin.stopImpersonating` is called.
		 */
		impersonateEnd: (
			/**
			 * `null` if the request is made from the server
			 */
			adminSession: {
				user: User & Record<string, unknown>;
				session: Session & Record<string, unknown>;
			} | null,
		) => Promise<void>;
		/**
		 * A callback when `admin.banUser` is called.
		 */
		ban: (
			adminSession: {
				user: User & Record<string, unknown>;
				session: Session & Record<string, unknown>;
			},
			bannedUser: UserWithRole,
		) => Promise<void>;
		/**
		 * A callback when `admin.unbanUser` is called.
		 */
		unban: (
			adminSession: {
				user: User & Record<string, unknown>;
				session: Session & Record<string, unknown>;
			},
			unbannedUser: UserWithRole,
		) => Promise<void>;
		/**
		 * A callback when `admin.createUser` is called.
		 */
		userCreate: (
			/**
			 * `null` if the request is made from the server
			 */
			adminSession: {
				user: User & Record<string, unknown>;
				session: Session & Record<string, unknown>;
			} | null,
			createdUser: UserWithRole,
		) => Promise<void>;
		/**
		 * A callback when `admin.removeUser` is called.
		 */
		userRemove: (
			/**
			 * `null` if the request is made from the server
			 */
			adminSession: {
				user: User & Record<string, unknown>;
				session: Session & Record<string, unknown>;
			} | null,
			removedUser: UserWithRole,
		) => Promise<void>;
	};
  /*
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
