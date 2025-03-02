import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	originCheck,
	sessionMiddleware,
} from "../../api";
import type { BetterAuthPlugin, User, Where } from "../../types";
import { APP_INVITE_ERROR_CODES } from "./error-codes";
import type { AppInvitation } from "./schema";
import { getAppInviteAdapter } from "./adapter";
import { BASE_ERROR_CODES } from "../../error/codes";
import { parseUserInput } from "../../db";
import { isDevelopment } from "../../utils/env";
import { setSessionCookie } from "../../cookies";

export interface AppInviteOptions {
	/**
	 * Define whether a user is allowed to send invitations.
	 *
	 * You can also pass a function that returns a boolean.
	 *
	 * 	@example
	 * ```ts
	 * allowUserToCreateInvitation: async (user) => {
	 * 		const canInvite: boolean = await hasPermission(user, 'send-invitation');
	 *      return canInvite;
	 * }
	 * ```
	 * @default true
	 */
	allowUserToCreateInvitation?:
		| boolean
		| ((user: User, type: "personal" | "public") => Promise<boolean> | boolean);
	/**
	 * Define whether a user is allowed to cancel invitations.
	 *
	 * By default users can only cancel invitations issued by themself.
	 */
	allowUserToCancelInvitation?: (data: {
		user: User;
		invitation: AppInvitation;
	}) => Promise<boolean> | boolean;
	/**
	 * The expiration time for the invitation link.
	 *
	 * @default 48 hours
	 */
	invitationExpiresIn?: number;
	/**
	 * Send an email with the
	 * invitation link to the user.
	 */
	sendInvitationEmail?: (
		data: {
			/**
			 * the invitation id
			 */
			id: string;
			/**
			 * the name of the user
			 */
			name?: string;
			/**
			 * the email of the user
			 */
			email: string;
			/**
			 * the member who is inviting the user
			 */
			inviter: User;
		},
		request?: Request,
	) => Promise<void>;
	/**
	 * The schema for the app-invite plugin.
	 */
	schema?: {
		appInvitation?: {
			modelName?: string;
			fields?: {
				[key in keyof Omit<AppInvitation, "id">]?: string;
			};
		};
	};
	/**
	 * Automatically sign in the user after sign up
	 */
	autoSignIn?: boolean;
	/**
	 * Rate limit configuration.
	 *
	 * @default {
	 *  window: 60,
	 *  max: 5,
	 * }
	 */
	rateLimit?: {
		window: number;
		max: number;
	};
	$Infer?: {
		/**
		 * Infer additional fields for the user
		 */
		AdditionalFields?: Record<string, any>;
	};
}

/**
 * App Invite plugin for Better Auth. This plugin allows you to invite other users the the app.
 *
 * @example
 * ```ts
 * const auth createAuth({
 *  plugins: [
 *      appInvite({
 *          sendInvitationEmail: async (data) => {
 *              // ...
 *          }
 *      })
 *  ]
 * })
 * ```
 */
export const appInvite = <O extends AppInviteOptions>(opts?: O) => {
	const options = {
		allowUserToCreateInvitation: true,
		allowUserToCancelInvitation: ({ user, invitation }) => {
			return invitation.inviterId === user.id;
		},
		...opts,
	} satisfies AppInviteOptions;

	return {
		id: "app-invite",
		endpoints: {
			createAppInvitation: createAuthEndpoint(
				"/invite-user",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						name: z
							.string({
								description:
									"The name of the user to invite (Only for personal invitations)",
							})
							.optional(),
						email: z
							.string({
								description:
									"The email address of the user to invite (Only for personal invitations)",
							})
							.optional(),
						resend: z
							.boolean({
								description:
									"Resend the invitation email, if the user is already invited",
							})
							.optional(),
						domainWhitelist: z
							.string({
								description:
									"A comma separated list of domains that are allowed to accept the invitation. (Only for public invitations)",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							operationId: "createAppInvitation",
							description: "Invite a user to the app",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												$ref: "#/components/schemas/AppInvitation",
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const invitationType = !!ctx.body.email ? "personal" : "public";
					if (invitationType === "personal" && !options?.sendInvitationEmail) {
						ctx.context.logger.warn(
							"Invitation email is not enabled. Pass `sendInvitationEmail` to the plugin options to enable it.",
						);
						throw new APIError("BAD_REQUEST", {
							message: "Invitation email is not enabled",
						});
					}

					const session = ctx.context.session;
					const canInvite =
						typeof options.allowUserToCreateInvitation === "function"
							? await options.allowUserToCreateInvitation(
									session.user,
									invitationType,
								)
							: options.allowUserToCreateInvitation;
					if (!canInvite) {
						throw new APIError("FORBIDDEN", {
							message:
								APP_INVITE_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_APPLICATION,
						});
					}

					const adapter = getAppInviteAdapter(ctx.context, options);
					if (ctx.body.email) {
						const alreadyMember =
							await ctx.context.internalAdapter.findUserByEmail(ctx.body.email);
						if (alreadyMember) {
							throw new APIError("BAD_REQUEST", {
								message:
									APP_INVITE_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_APPLICATION,
							});
						}
						const alreadyInvited = await adapter.findPendingInvitation({
							email: ctx.body.email,
						});
						if (!!alreadyInvited && !ctx.body.resend) {
							throw new APIError("BAD_REQUEST", {
								message:
									APP_INVITE_ERROR_CODES.USER_WAS_ALREADY_INVITED_TO_THIS_APPLICATION,
							});
						}
					}

					const invitation = await adapter.createInvitation({
						invitation: {
							name: ctx.body.name,
							email: ctx.body.email,
							domainWhitelist: ctx.body.domainWhitelist,
						},
						user: session.user,
					});

					if (invitation.email) {
						await options.sendInvitationEmail?.(
							{
								id: invitation.id,
								name: invitation.name,
								email: invitation.email,
								inviter: session.user,
							},
							ctx.request,
						);
					}
					return ctx.json(invitation);
				},
			),
			getAppInvitation: createAuthEndpoint(
				"/get-app-invitation",
				{
					method: "GET",
					query: z.object({
						id: z.string({
							description: "The ID of the invitation to get.",
						}),
					}),
					metadata: {
						openapi: {
							operationId: "getAppInvitation",
							description: "Get an invitation by ID",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												$ref: "#/components/schemas/AppInvitation",
												type: "object",
												properties: {
													id: {
														type: "string",
													},
													name: {
														type: "string",
													},
													email: {
														type: "string",
													},
													inviterId: {
														type: "string",
													},
													status: {
														type: "string",
													},
													expiresAt: {
														type: "string",
													},
													inviterEmail: {
														type: "string",
													},
												},
												required: [
													"id",
													"inviterId",
													"status",
													"expiresAt",
													"inviterEmail",
												],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const adapter = getAppInviteAdapter(ctx.context, options);
					const invitation = await adapter.findInvitationById(ctx.query.id);
					if (
						!invitation ||
						invitation.status !== "pending" ||
						invitation.expiresAt < new Date()
					) {
						throw new APIError("BAD_REQUEST", {
							message: APP_INVITE_ERROR_CODES.APP_INVITATION_NOT_FOUND,
						});
					}

					const inviter = await ctx.context.internalAdapter.findUserById(
						invitation.inviterId,
					);
					if (!inviter) {
						throw new APIError("BAD_REQUEST", {
							message:
								APP_INVITE_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THIS_APPLICATION,
						});
					}

					return ctx.json({
						...invitation,
						inviterEmail: inviter.email,
					});
				},
			),
			acceptAppInvitation: createAuthEndpoint(
				"/accept-invitation",
				{
					method: "POST",
					query: z
						.object({
							callbackURL: z
								.string({
									description:
										"The URL to redirect to after accepting the invitation",
								})
								.optional(),
						})
						.optional(),
					use: [originCheck((ctx) => ctx.query?.callbackURL)],
					body: z
						.object({
							invitationId: z.string({
								description: "The ID of the invitation",
							}),
						})
						.and(z.record(z.string(), z.any())),
					metadata: {
						$Infer: {
							body: {} as {
								invitationId: string;

								name?: string;
								email?: string;
								password: string;
							} & (O["$Infer"] extends {
								AdditionalFields: Record<string, any>;
							}
								? O["$Infer"]["AdditionalFields"]
								: {}),
						},
						openapi: {
							operationId: "acceptAppInvitation",
							description:
								"Accept an app invitation that has been issued by another user",
							requestBody: {
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												name: {
													type: "string",
													description: "The name of the user",
												},
												email: {
													type: "string",
													description: "The email address of the user",
												},
												password: {
													type: "string",
													description: "The password of the user",
												},
											},
											required: ["password"],
										},
									},
								},
							},
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													token: {
														type: "string",
													},
													invitation: {
														type: "object",
													},
													user: {
														type: "object",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const adapter = getAppInviteAdapter(ctx.context, options);
					const { invitationId, ...bodyData } = ctx.body;
					const invitation = await adapter.findInvitationById(invitationId);
					if (
						!invitation ||
						invitation.status !== "pending" ||
						invitation.expiresAt < new Date()
					) {
						throw new APIError("BAD_REQUEST", {
							message: APP_INVITE_ERROR_CODES.APP_INVITATION_NOT_FOUND,
						});
					}

					const invitationType = invitation.email ? "personal" : "public";

					const inviter = await ctx.context.internalAdapter.findUserById(
						invitation.inviterId,
					);
					if (!inviter) {
						throw new APIError("BAD_REQUEST", {
							message:
								APP_INVITE_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THIS_APPLICATION,
						});
					}

					const body = {
						...(bodyData as any),
						email: invitation.email || bodyData.email,
						name: invitation.name || bodyData.name,
					} as User & {
						password: string;
					} & {
						[key: string]: any;
					};
					const { name, email, password, image, ...additionalFields } = body;
					const isValidEmail = z.string().email().safeParse(email);

					if (!isValidEmail.success) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.INVALID_EMAIL,
						});
					}

					if (invitationType === "public") {
						const [_lP, domain] = email.split("@", 2);

						const domainWhitelist = invitation.domainWhitelist?.split(",");

						if (
							domainWhitelist?.length &&
							domainWhitelist.length > 0 &&
							!domainWhitelist.some(
								(wDomain) =>
									wDomain.trim().toLowerCase() === domain.trim().toLowerCase(),
							)
						) {
							throw new APIError("FORBIDDEN", {
								message:
									APP_INVITE_ERROR_CODES.EMAIL_DOMAIN_IS_NOT_IN_WHITELIST,
							});
						}
					}

					const minPasswordLength =
						ctx.context.password.config.minPasswordLength;
					if (password.length < minPasswordLength) {
						ctx.context.logger.error("Password is too short");
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
						});
					}

					const maxPasswordLength =
						ctx.context.password.config.maxPasswordLength;
					if (password.length > maxPasswordLength) {
						ctx.context.logger.error("Password is too long");
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
						});
					}
					const dbUser =
						await ctx.context.internalAdapter.findUserByEmail(email);
					if (dbUser?.user) {
						ctx.context.logger.info(
							`Sign-up attempt for existing email: ${email}`,
						);
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: BASE_ERROR_CODES.USER_ALREADY_EXISTS,
						});
					}

					const additionalData = parseUserInput(
						ctx.context.options,
						additionalFields,
					);
					let createdUser: User;
					try {
						createdUser = await ctx.context.internalAdapter.createUser({
							email: email.toLowerCase(),
							name,
							image,
							...additionalData,
							emailVerified: true,
						});
						if (!createdUser) {
							throw new APIError("BAD_REQUEST", {
								message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
							});
						}
					} catch (e) {
						if (isDevelopment) {
							ctx.context.logger.error("Failed to create user", e);
						}
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
							details: e,
						});
					}
					if (!createdUser) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
						});
					}

					/**
					 * Link the account to the user
					 */
					const hash = await ctx.context.password.hash(password);
					await ctx.context.internalAdapter.linkAccount({
						userId: createdUser.id,
						providerId: "credential",
						accountId: createdUser.id,
						password: hash,
					});

					let acceptedI: AppInvitation | null = invitation;
					if (invitationType === "personal") {
						acceptedI = await adapter.updateInvitation({
							invitationId,
							status: "accepted",
						});
					}

					if (!options?.autoSignIn) {
						return ctx.json({
							token: null,
							user: {
								id: createdUser.id,
								email: createdUser.email,
								name: createdUser.name,
								image: createdUser.image,
								emailVerified: createdUser.emailVerified,
								createdAt: createdUser.createdAt,
								updatedAt: createdUser.updatedAt,
							},
							invitation: acceptedI,
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						createdUser.id,
						ctx.request,
					);
					if (!session) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						});
					}
					await setSessionCookie(ctx, {
						session,
						user: createdUser,
					});

					if (!ctx.query?.callbackURL) {
						return ctx.json({
							token: session.token,
							user: {
								id: createdUser.id,
								email: createdUser.email,
								name: createdUser.name,
								image: createdUser.image,
								emailVerified: createdUser.emailVerified,
								createdAt: createdUser.createdAt,
								updatedAt: createdUser.updatedAt,
							},
							invitation: acceptedI,
						});
					}
					throw ctx.redirect(ctx.query.callbackURL);
				},
			),
			rejectAppInvitation: createAuthEndpoint(
				"/reject-invitation",
				{
					method: "POST",
					query: z
						.object({
							callbackURL: z
								.string({
									description:
										"The URL to redirect to after rejecting the invitation",
								})
								.optional(),
						})
						.optional(),
					body: z.object({
						invitationId: z.string({
							description: "The ID of the invitation",
						}),
					}),
					use: [originCheck((ctx) => ctx.query?.callbackURL)],
					metadata: {
						openapi: {
							operationId: "rejectAppInvitation",
							description: "Reject an app invitation",
							requestBody: {
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												invitationId: {
													type: "string",
												},
											},
											required: ["invitationId"],
										},
									},
								},
							},
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													token: {
														type: "null",
													},
													invitation: {
														type: "object",
													},
													user: {
														type: "null",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const adapter = getAppInviteAdapter(ctx.context, options);
					const invitation = await adapter.findInvitationById(
						ctx.body.invitationId,
					);
					if (
						!invitation ||
						invitation.expiresAt < new Date() ||
						invitation.status !== "pending"
					) {
						throw new APIError("BAD_REQUEST", {
							message: APP_INVITE_ERROR_CODES.APP_INVITATION_NOT_FOUND,
						});
					}
					if (!invitation.email) {
						throw new APIError("BAD_REQUEST", {
							message:
								APP_INVITE_ERROR_CODES.THIS_APP_INVITATION_CANT_BE_REJECTED,
						});
					}
					const rejectedI = await adapter.updateInvitation({
						invitationId: ctx.body.invitationId,
						status: "rejected",
					});
					return ctx.json({
						token: null,
						invitation: rejectedI,
						user: null,
					});
				},
			),
			cancelAppInvitation: createAuthEndpoint(
				"/cancel-invitation",
				{
					method: "POST",
					body: z.object({
						invitationId: z.string({
							description: "The ID of the app invitation to cancel",
						}),
					}),
					use: [sessionMiddleware],
					openapi: {
						operationId: "cancelAppInvitation",
						description: "Cancel an app invitation",
						responses: {
							"200": {
								description: "Success",
								content: {
									"application/json": {
										schema: {
											$ref: "#/components/schemas/AppInvitation",
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const session = ctx.context.session;
					const adapter = getAppInviteAdapter(ctx.context, options);
					const invitation = await adapter.findInvitationById(
						ctx.body.invitationId,
					);
					if (!invitation) {
						throw new APIError("BAD_REQUEST", {
							message: APP_INVITE_ERROR_CODES.APP_INVITATION_NOT_FOUND,
						});
					}
					const canCancel = await options.allowUserToCancelInvitation?.({
						user: session.user,
						invitation,
					});
					if (!canCancel) {
						throw new APIError("FORBIDDEN", {
							message:
								APP_INVITE_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_APP_INVITATION,
						});
					}
					const canceledI = await adapter.updateInvitation({
						invitationId: ctx.body.invitationId,
						status: "canceled",
					});
					return ctx.json(canceledI);
				},
			),
			listAppInvitations: createAuthEndpoint(
				"/list-invitations",
				{
					method: "GET",
					use: [sessionMiddleware],
					query: z.object({
						searchValue: z
							.string({
								description: "The value to search for",
							})
							.optional(),
						searchField: z
							.enum(["name", "email", "domainWhitelist"], {
								description:
									"The field to search in, defaults to email. Can be `email`, `name` or `domainWhitelist`",
							})
							.optional(),
						searchOperator: z
							.enum(["contains", "starts_with", "ends_with"], {
								description:
									"The operator to use for the search. Can be `contains`, `starts_with` or `ends_with`",
							})
							.optional(),
						limit: z
							.string({
								description: "The numbers of invitations to return",
							})
							.or(z.number())
							.optional(),
						offset: z
							.string({
								description: "The offset to start from",
							})
							.or(z.number())
							.optional(),
						sortBy: z
							.string({
								description: "The field to sort by",
							})
							.optional(),
						sortDirection: z
							.enum(["asc", "desc"], {
								description: "The direction to sort by",
							})
							.optional(),
						filterField: z
							.string({
								description: "The field to filter by",
							})
							.optional(),
						filterValue: z
							.string({
								description: "The value to filter by",
							})
							.or(z.number())
							.optional(),
						filterOperator: z
							.enum(["eq", "ne", "lt", "lte", "gt", "gte"], {
								description: "The operator to use for the filter",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							operationId: "listAppInvitations",
							summary: "List issued invitations",
							description: "List issued invitations",
							responses: {
								200: {
									description: "List of issued invitations",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													invitations: {
														type: "array",
														items: {
															$ref: "#/components/schemas/AppInvitation",
														},
													},
													total: {
														type: "number",
													},
													limit: {
														type: ["number", "undefined"],
													},
													offset: {
														type: ["number", "undefined"],
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const where: Where[] = [];

					if (ctx.query?.searchValue) {
						where.push({
							field: ctx.query.searchField || "email",
							operator: ctx.query.searchOperator || "contains",
							value: ctx.query.searchValue,
						});
					}

					if (ctx.query?.filterValue && ctx.query.filterField !== "inviterId") {
						where.push({
							field: ctx.query.filterField || "email",
							operator: ctx.query.filterOperator || "eq",
							value: ctx.query.filterValue,
						});
					}

					const adapter = await getAppInviteAdapter(ctx.context, options);

					try {
						const limit = Number(ctx.query?.limit) || undefined;
						const offset = Number(ctx.query?.offset) || undefined;

						const invitations = await adapter.listInvitationsByIssuer(
							ctx.context.session.user.id,
							Number(ctx.query?.limit) || undefined,
							Number(ctx.query?.offset) || undefined,
							ctx.query?.sortBy
								? {
										field: ctx.query.sortBy,
										direction: ctx.query.sortDirection || "asc",
									}
								: undefined,
							where.length ? where : undefined,
						);

						return ctx.json({
							invitations,
							limit,
							offset,
						});
					} catch (e) {
						return ctx.json({
							invitations: [],
						});
					}
				},
			),
		},
		rateLimit: [
			{
				pathMatcher(path) {
					return (
						path.startsWith("/accept-invitation") ||
						path.startsWith("/reject-invitation") ||
						path.startsWith("/cancel-invitation") ||
						path.startsWith("/list-invitations") ||
						path.startsWith("/invite-user") ||
						path.startsWith("/get-app-invitation")
					);
				},
				window: options?.rateLimit?.window || 60,
				max: options?.rateLimit?.max || 5,
			},
		],
		schema: {
			appInvitation: {
				modelName: options?.schema?.appInvitation?.modelName,
				fields: {
					name: {
						type: "string",
						required: false,
						sortable: true,
						fieldName: options?.schema?.appInvitation?.fields?.name,
					},
					email: {
						type: "string",
						required: false,
						sortable: true,
						fieldName: options?.schema?.appInvitation?.fields?.email,
					},
					status: {
						type: "string",
						required: true,
						sortable: true,
						defaultValue: "pending",
						fieldName: options?.schema?.appInvitation?.fields?.status,
					},
					expiresAt: {
						type: "date",
						required: true,
						fieldName: options?.schema?.appInvitation?.fields?.expiresAt,
					},
					inviterId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
						},
						fieldName: options?.schema?.appInvitation?.fields?.inviterId,
						required: true,
					},
					domainWhitelist: {
						type: "string",
						required: false,
						fieldName: options?.schema?.appInvitation?.fields?.domainWhitelist,
					},
				},
			},
		},
		$Infer: {
			AppInvitation: {} as AppInvitation,
		},
		$ERROR_CODES: APP_INVITE_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
