import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { APIError } from "../../api";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { ADMIN_ERROR_CODES } from "./error-codes";
import {
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
import {
	createRole,
	deleteRole,
	getRole,
	listRoles,
	updateRole,
} from "./routes/crud-access-control";
import type {
	AdminOptions,
	SessionWithImpersonatedBy,
	UserWithRole,
} from "./types";

export const admin = <O extends AdminOptions>(options?: O | undefined) => {
	const opts = {
		defaultRole: options?.defaultRole ?? "user",
		adminRoles: options?.adminRoles ?? ["admin"],
		bannedUserMessage:
			options?.bannedUserMessage ??
			"You have been banned from this application. Please contact support if you believe this is an error.",
		...options,
	};
	const baseEndpoints = {
		setRole: setRole(opts),
		getUser: getUser(opts),
		createUser: createUser(opts),
		adminUpdateUser: adminUpdateUser(opts),
		listUsers: listUsers(opts),
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
	};

	const dynamicAccessControlEndpoints = {
		createRole: createRole<O>(opts as O),
		deleteRole: deleteRole<O>(opts as O),
		listRoles: listRoles<O>(opts as O),
		getRole: getRole<O>(opts as O),
		updateRole: updateRole<O>(opts as O),
	};

	return {
		id: "admin",
		init() {
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
									)) as UserWithRole;

									if (user.banned) {
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

										if (
											ctx &&
											(ctx.path.startsWith("/callback") ||
												ctx.path.startsWith("/oauth2/callback"))
										) {
											const redirectURI =
												ctx.context.options.onAPIError?.errorURL ||
												`${ctx.context.baseURL}/error`;
											throw ctx.redirect(
												`${redirectURI}?error=banned&error_description=${opts.bannedUserMessage}`,
											);
										}

										throw new APIError("FORBIDDEN", {
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
			...baseEndpoints,
			...(options?.dynamicAccessControl ? dynamicAccessControlEndpoints : {}),
		} as typeof baseEndpoints &
			(O extends { dynamicAccessControl: { enabled: true } }
				? typeof dynamicAccessControlEndpoints
				: {}),
		$ERROR_CODES: ADMIN_ERROR_CODES,
		schema: {
			user: {
				fields: {
					role: {
						type: "string",
						required: false,
						input: false,
						fieldName: opts.schema?.user?.fields?.role,
					},
					banned: {
						type: "boolean",
						defaultValue: false,
						required: false,
						input: false,
						fieldName: opts.schema?.user?.fields?.banned,
					},
					banReason: {
						type: "string",
						required: false,
						input: false,
						fieldName: opts.schema?.user?.fields?.banReason,
					},
					banExpires: {
						type: "date",
						required: false,
						input: false,
						fieldName: opts.schema?.user?.fields?.banExpires,
					},
				},
			},
			session: {
				fields: {
					impersonatedBy: {
						type: "string",
						required: false,
						fieldName: opts.schema?.session?.fields?.impersonatedBy,
					},
				},
			},
			...(opts.dynamicAccessControl?.enabled
				? ({
						role: {
							modelName: opts.schema?.role?.modelName,
							fields: {
								role: {
									type: "string",
									required: true,
									fieldName: opts.schema?.role?.fields?.role,
								},
								permission: {
									type: "string",
									required: true,
									fieldName: opts.schema?.role?.fields?.permission,
								},
								createdAt: {
									type: "date",
									required: true,
									defaultValue: () => new Date(),
									fieldName: opts.schema?.role?.fields?.createdAt,
								},
								updatedAt: {
									type: "date",
									required: false,
									fieldName: opts.schema?.role?.fields?.updatedAt,
								},
								...(opts.schema?.role?.additionalFields || {}),
							},
						},
					} satisfies BetterAuthPluginDBSchema)
				: {}),
		},
		options: options as any,
	} satisfies BetterAuthPlugin;
};
