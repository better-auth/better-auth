import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { mergeSchema } from "../../db/schema";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { PACKAGE_VERSION } from "../../version";
import { defaultRoles } from "./access";
import { ADMIN_ERROR_CODES } from "./error-codes";
import {
	adminListOrganizations,
	adminUpdateUser,
	banUser,
	createUser,
	getUser,
	impersonateUser,
	listUserSessions,
	listUsers,
	removeUser,
	revokeUserSession,
	revokeUserSessions,
	setRole,
	setUserPassword,
	stopImpersonating,
	unbanUser,
	userHasPermission,
} from "./routes";
import { schema } from "./schema";
import type {
	AdminOptions,
	SessionWithImpersonatedBy,
	UserWithRole,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		admin: {
			creator: typeof admin;
		};
	}
}

const createAdminPlugin = <O extends AdminOptions>(options?: O | undefined) => {
	const opts = {
		...(options || {}),
		defaultRole: options?.defaultRole ?? "user",
		adminRoles: options?.adminRoles ?? ["admin"],
		bannedUserMessage:
			options?.bannedUserMessage ??
			"You have been banned from this application. Please contact support if you believe this is an error.",
	} as O &
		Required<
			Pick<AdminOptions, "defaultRole" | "adminRoles" | "bannedUserMessage">
		>;

	if (options?.adminRoles) {
		const adminRoles = Array.isArray(options.adminRoles)
			? options.adminRoles
			: [...options.adminRoles.split(",")];
		const invalidRoles = adminRoles.filter(
			(role) =>
				!Object.keys(options?.roles || defaultRoles)
					.map((r) => r.toLowerCase())
					.includes(role.toLowerCase()),
		);
		if (invalidRoles.length > 0) {
			throw new BetterAuthError(
				`Invalid admin roles: ${invalidRoles.join(", ")}. Admin roles must be defined in the 'roles' configuration.`,
			);
		}
	}

	return {
		id: "admin",
		version: PACKAGE_VERSION,
		init(ctx) {
			if (opts.organizations?.enabled && !ctx.hasPlugin("organization")) {
				throw new BetterAuthError(
					"The admin organization endpoints require the organization plugin to be enabled.",
				);
			}
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user) {
									return {
										data: {
											role: options?.defaultRole ?? "user",
											...user,
										},
									};
								},
							},
						},
						session: {
							create: {
								async before(session, ctx) {
									if (!ctx) {
										return;
									}
									const user = (await ctx.context.internalAdapter.findUserById(
										session.userId,
									)) as UserWithRole | null;

									if (user?.banned) {
										if (
											user.banExpires &&
											new Date(user.banExpires).getTime() < Date.now()
										) {
											await ctx.context.internalAdapter.updateUser(
												session.userId,
												{
													banned: false,
													banReason: null,
													banExpires: null,
												},
											);
											return;
										}

										if (ctx.path.startsWith("/callback")) {
											const redirectURI =
												ctx.context.options.onAPIError?.errorURL ||
												`${ctx.context.baseURL}/error`;
											throw ctx.redirect(
												`${redirectURI}?error=banned&error_description=${opts.bannedUserMessage}`,
											);
										}

										throw APIError.from("FORBIDDEN", {
											message: opts.bannedUserMessage,
											code: "BANNED_USER",
										});
									}
								},
							},
						},
					},
				},
			};
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return context.path === "/list-sessions";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const response =
							await getEndpointResponse<SessionWithImpersonatedBy[]>(ctx);

						if (!response) {
							return;
						}
						const newJson = response.filter((session) => {
							return !session.impersonatedBy;
						});

						return ctx.json(newJson);
					}),
				},
			],
		},
		endpoints: {
			setRole: setRole(opts),
			getUser: getUser(opts),
			createUser: createUser(opts),
			adminUpdateUser: adminUpdateUser(opts),
			listUsers: listUsers(opts),
			...(opts.organizations?.enabled
				? { adminListOrganizations: adminListOrganizations(opts) }
				: {}),
			listUserSessions: listUserSessions(opts),
			unbanUser: unbanUser(opts),
			banUser: banUser(opts),
			impersonateUser: impersonateUser(opts),
			stopImpersonating: stopImpersonating(),
			revokeUserSession: revokeUserSession(opts),
			revokeUserSessions: revokeUserSessions(opts),
			removeUser: removeUser(opts),
			setUserPassword: setUserPassword(opts),
			userHasPermission: userHasPermission(opts as O),
		},
		$ERROR_CODES: ADMIN_ERROR_CODES,
		schema: mergeSchema(schema, opts.schema),
		options: options as NoInfer<O>,
	} satisfies BetterAuthPlugin;
};

type DefaultAdminPlugin<O extends AdminOptions> = ReturnType<
	typeof createAdminPlugin<O>
>;

export type AdminPluginWithoutOrganizations<O extends AdminOptions> = Omit<
	DefaultAdminPlugin<O>,
	"endpoints"
> & {
	endpoints: Omit<DefaultAdminPlugin<O>["endpoints"], "adminListOrganizations">;
};

export type AdminPluginWithOrganizations<O extends AdminOptions> = Omit<
	DefaultAdminPlugin<O>,
	"endpoints"
> & {
	endpoints: Omit<
		DefaultAdminPlugin<O>["endpoints"],
		"adminListOrganizations"
	> & {
		adminListOrganizations: ReturnType<typeof adminListOrganizations>;
	};
};

export function admin<
	O extends AdminOptions & { organizations: { enabled: true } },
>(options: O): AdminPluginWithOrganizations<O>;
export function admin<O extends AdminOptions>(
	options?: O | undefined,
): AdminPluginWithoutOrganizations<O>;
export function admin<O extends AdminOptions>(options?: O | undefined) {
	return createAdminPlugin(options) as
		| AdminPluginWithoutOrganizations<O>
		| AdminPluginWithOrganizations<O>;
}
