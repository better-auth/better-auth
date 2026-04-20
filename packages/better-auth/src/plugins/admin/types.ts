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
	 * Send an enrollment email to a newly created user who has no password.
	 *
	 * When `createUser` is called without a `password`, if this callback is
	 * provided the user will be created with `emailVerified: false` and an
	 * enrollment token will be generated. The token can be redeemed via
	 * `POST /admin/complete-enrollment` to set the password and verify the
	 * email in one step.
	 *
	 * @example
	 * ```ts
	 * sendEnrollmentEmail: async ({ user, url, token }) => {
	 *   await sendEmail({
	 *     to: user.email,
	 *     subject: "Complete your registration",
	 *     body: `Set your password here: ${url}`,
	 *   });
	 * }
	 * ```
	 */
	sendEnrollmentEmail?:
		| ((
				data: {
					/**
					 * The newly created user
					 */
					user: User;
					/**
					 * The enrollment URL (points to `/admin/complete-enrollment?token=...`)
					 */
					url: string;
					/**
					 * The raw enrollment token
					 */
					token: string;
				},
				request?: Request,
		  ) => Promise<void>)
		| undefined;
	/**
	 * Duration of the enrollment token in seconds.
	 *
	 * @default 172800 (48 hours)
	 */
	enrollmentExpiresIn?: number | undefined;
}

export type InferAdminRolesFromOption<O extends AdminOptions | undefined> =
	O extends { roles: Record<string, unknown> }
		? keyof O["roles"]
		: "user" | "admin";
