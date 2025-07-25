import * as z from "zod/v4";
import { createAuthEndpoint } from "../../../api/call";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { APIError } from "better-call";
import { setSessionCookie } from "../../../cookies";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { getSessionFromCtx, requestOnlySessionMiddleware } from "../../../api";
import type { OrganizationOptions } from "../types";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	Member,
	Team,
	TeamMember,
} from "../schema";
import { hasPermission } from "../has-permission";
import {
	toZodSchema,
	type InferAdditionalFieldsFromPluginOptions,
} from "../../../db";

export const createOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.organization?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		name: z.string().meta({
			description: "The name of the organization",
		}),
		slug: z.string().meta({
			description: "The slug of the organization",
		}),
		userId: z.coerce
			.string()
			.meta({
				description:
					'The user id of the organization creator. If not provided, the current user will be used. Should only be used by admins or when called by the server. server-only. Eg: "user-id"',
			})
			.optional(),
		logo: z
			.string()
			.meta({
				description: "The logo of the organization",
			})
			.optional(),
		metadata: z
			.record(z.string(), z.any())
			.meta({
				description: "The metadata of the organization",
			})
			.optional(),
		keepCurrentActiveOrganization: z
			.boolean()
			.meta({
				description:
					"Whether to keep the current active organization active after creating a new one. Eg: true",
			})
			.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"organization", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/organization/create",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			use: [orgMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Create an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The organization that was created",
										$ref: "#/components/schemas/Organization",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);

			if (!session && (ctx.request || ctx.headers)) {
				throw new APIError("UNAUTHORIZED");
			}
			let user = session?.user || null;
			if (!user) {
				if (!ctx.body.userId) {
					throw new APIError("UNAUTHORIZED");
				}
				user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
			}
			if (!user) {
				return ctx.json(null, {
					status: 401,
				});
			}
			const options = ctx.context.orgOptions;
			const canCreateOrg =
				typeof options?.allowUserToCreateOrganization === "function"
					? await options.allowUserToCreateOrganization(user)
					: options?.allowUserToCreateOrganization === undefined
						? true
						: options.allowUserToCreateOrganization;

			if (!canCreateOrg) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options as O);

			const userOrganizations = await adapter.listOrganizations(user.id);
			const hasReachedOrgLimit =
				typeof options.organizationLimit === "number"
					? userOrganizations.length >= options.organizationLimit
					: typeof options.organizationLimit === "function"
						? await options.organizationLimit(user)
						: false;

			if (hasReachedOrgLimit) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS,
				});
			}

			const existingOrganization = await adapter.findOrganizationBySlug(
				ctx.body.slug,
			);
			if (existingOrganization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_ALREADY_EXISTS,
				});
			}

			const {
				keepCurrentActiveOrganization: _,
				userId: __,
				...orgData
			} = ctx.body;

			let hookResponse:
				| {
						data: Record<string, any>;
				  }
				| undefined = undefined;

			if (options.organizationCreation?.beforeCreate) {
				const response = await options.organizationCreation.beforeCreate(
					{
						organization: {
							...orgData,
							createdAt: new Date(),
						},
						user,
					},
					ctx.request,
				);
				if (response && typeof response === "object" && "data" in response) {
					hookResponse = response;
				}
			}

			const organization = await adapter.createOrganization({
				organization: {
					...orgData,
					createdAt: new Date(),
					...(hookResponse?.data || {}),
				},
			});

			let member:
				| (Member & InferAdditionalFieldsFromPluginOptions<"member", O, false>)
				| undefined;
			let teamMember: TeamMember | null = null;

			if (
				options?.teams?.enabled &&
				options.teams.defaultTeam?.enabled !== false
			) {
				const defaultTeam =
					(await options.teams.defaultTeam?.customCreateDefaultTeam?.(
						organization,
						ctx.request,
					)) ||
					(await adapter.createTeam({
						organizationId: organization.id,
						name: `${organization.name}`,
						createdAt: new Date(),
					}));

				member = await adapter.createMember({
					userId: user.id,
					organizationId: organization.id,
					role: ctx.context.orgOptions.creatorRole || "owner",
				});

				teamMember = await adapter.findOrCreateTeamMember({
					teamId: defaultTeam.id,
					userId: user.id,
				});
			} else {
				member = await adapter.createMember({
					userId: user.id,
					organizationId: organization.id,
					role: ctx.context.orgOptions.creatorRole || "owner",
				});
			}

			if (options.organizationCreation?.afterCreate) {
				await options.organizationCreation.afterCreate(
					{
						organization,
						user,
						member,
					},
					ctx.request,
				);
			}

			if (ctx.context.session && !ctx.body.keepCurrentActiveOrganization) {
				await adapter.setActiveOrganization(
					ctx.context.session.session.token,
					organization.id,
				);
			}

			if (
				teamMember &&
				ctx.context.session &&
				!ctx.body.keepCurrentActiveOrganization
			) {
				await adapter.setActiveTeam(
					ctx.context.session.session.token,
					teamMember.teamId,
				);
			}

			return ctx.json({
				...organization,
				metadata: ctx.body.metadata,
				members: [member],
			});
		},
	);
};

export const checkOrganizationSlug = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/check-slug",
		{
			method: "POST",
			body: z.object({
				slug: z.string().meta({
					description: 'The organization slug to check. Eg: "my-org"',
				}),
			}),
			use: [requestOnlySessionMiddleware, orgMiddleware],
		},
		async (ctx) => {
			const orgAdapter = getOrgAdapter<O>(ctx.context, options);
			const org = await orgAdapter.findOrganizationBySlug(ctx.body.slug);
			if (!org) {
				return ctx.json({
					status: true,
				});
			}
			throw new APIError("BAD_REQUEST", {
				message: "slug is taken",
			});
		},
	);

export const updateOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.organization?.additionalFields || {},
		isClientSide: true,
	});
	type Body = {
		data: {
			name?: string;
			slug?: string;
			logo?: string;
			metadata?: Record<string, any>;
		} & InferAdditionalFieldsFromPluginOptions<"organization", O>;
		organizationId: string;
	};
	return createAuthEndpoint(
		"/organization/update",
		{
			method: "POST",
			body: z.object({
				data: z
					.object({
						...additionalFieldsSchema.shape,
						name: z
							.string()
							.meta({
								description: "The name of the organization",
							})
							.optional(),
						slug: z
							.string()
							.meta({
								description: "The slug of the organization",
							})
							.optional(),
						logo: z
							.string()
							.meta({
								description: "The logo of the organization",
							})
							.optional(),
						metadata: z
							.record(z.string(), z.any())
							.meta({
								description: "The metadata of the organization",
							})
							.optional(),
					})
					.partial(),
				organizationId: z
					.string()
					.meta({
						description: 'The organization ID. Eg: "org-id"',
					})
					.optional(),
			}),
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Update an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The updated organization",
										$ref: "#/components/schemas/Organization",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await ctx.context.getSession(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "User not found",
				});
			}
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}
			const canUpdateOrg = hasPermission({
				permissions: {
					organization: ["update"],
				},
				role: member.role,
				options: ctx.context.orgOptions,
			});
			if (!canUpdateOrg) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION,
				});
			}
			const updatedOrg = await adapter.updateOrganization(
				organizationId,
				ctx.body.data,
			);
			return ctx.json(updatedOrg);
		},
	);
};

export const deleteOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/delete",
		{
			method: "POST",
			body: z.object({
				organizationId: z.string().meta({
					description: "The organization id to delete",
				}),
			}),
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					description: "Delete an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "string",
										description: "The organization id that was deleted",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await ctx.context.getSession(ctx);
			if (!session) {
				return ctx.json(null, {
					status: 401,
				});
			}
			const organizationId = ctx.body.organizationId;
			if (!organizationId) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				return ctx.json(null, {
					status: 400,
					body: {
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
				});
			}
			const canDeleteOrg = hasPermission({
				role: member.role,
				permissions: {
					organization: ["delete"],
				},
				options: ctx.context.orgOptions,
			});
			if (!canDeleteOrg) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION,
				});
			}
			if (organizationId === session.session.activeOrganizationId) {
				/**
				 * If the organization is deleted, we set the active organization to null
				 */
				await adapter.setActiveOrganization(session.session.token, null);
			}
			const option = ctx.context.orgOptions.organizationDeletion;
			if (option?.disabled) {
				throw new APIError("FORBIDDEN");
			}
			const org = await adapter.findOrganizationById(organizationId);
			if (!org) {
				throw new APIError("BAD_REQUEST");
			}
			if (option?.beforeDelete) {
				await option.beforeDelete({
					organization: org,
					user: session.user,
				});
			}
			await adapter.deleteOrganization(organizationId);
			if (option?.afterDelete) {
				await option.afterDelete({
					organization: org,
					user: session.user,
				});
			}
			return ctx.json(org);
		},
	);
};
export const getFullOrganization = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/get-full-organization",
		{
			method: "GET",
			query: z.optional(
				z.object({
					organizationId: z
						.string()
						.meta({
							description: "The organization id to get",
						})
						.optional(),
					organizationSlug: z
						.string()
						.meta({
							description: "The organization slug to get",
						})
						.optional(),
				}),
			),
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "Get the full organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The organization",
										$ref: "#/components/schemas/Organization",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const organizationId =
				ctx.query?.organizationSlug ||
				ctx.query?.organizationId ||
				session.session.activeOrganizationId;
			if (!organizationId) {
				return ctx.json(null, {
					status: 200,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const organization = await adapter.findFullOrganization({
				organizationId,
				isSlug: !!ctx.query?.organizationSlug,
				includeTeams: ctx.context.orgOptions.teams?.enabled,
			});
			const isMember = organization?.members.find(
				(member) => member.userId === session.user.id,
			);
			if (!isMember) {
				await adapter.setActiveOrganization(session.session.token, null);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}
			type OrganizationReturn = O["teams"] extends { enabled: true }
				? {
						members: InferMember<O>[];
						invitations: InferInvitation<O>[];
						teams: Team[];
					} & InferOrganization<O>
				: {
						members: InferMember<O>[];
						invitations: InferInvitation<O>[];
					} & InferOrganization<O>;
			return ctx.json(organization as unknown as OrganizationReturn);
		},
	);

export const setActiveOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/set-active",
		{
			method: "POST",
			body: z.object({
				organizationId: z
					.string()
					.meta({
						description:
							'The organization id to set as active. It can be null to unset the active organization. Eg: "org-id"',
					})
					.nullable()
					.optional(),
				organizationSlug: z
					.string()
					.meta({
						description:
							'The organization slug to set as active. It can be null to unset the active organization if organizationId is not provided. Eg: "org-slug"',
					})
					.optional(),
			}),
			use: [orgSessionMiddleware, orgMiddleware],
			metadata: {
				openapi: {
					description: "Set the active organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The organization",
										$ref: "#/components/schemas/Organization",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const session = ctx.context.session;
			let organizationId = ctx.body.organizationSlug || ctx.body.organizationId;
			if (organizationId === null) {
				const sessionOrgId = session.session.activeOrganizationId;
				if (!sessionOrgId) {
					return ctx.json(null);
				}
				const updatedSession = await adapter.setActiveOrganization(
					session.session.token,
					null,
				);
				await setSessionCookie(ctx, {
					session: updatedSession,
					user: session.user,
				});
				return ctx.json(null);
			}
			if (!organizationId) {
				const sessionOrgId = session.session.activeOrganizationId;
				if (!sessionOrgId) {
					return ctx.json(null);
				}
				organizationId = sessionOrgId;
			}
			const isMember = await adapter.checkMembership({
				userId: session.user.id,
				organizationId,
			});
			if (!isMember) {
				await adapter.setActiveOrganization(session.session.token, null);
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}
			let organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				if (ctx.body.organizationSlug) {
					organization = await adapter.findOrganizationBySlug(organizationId);
				}
				if (!organization) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					});
				}
			}
			const updatedSession = await adapter.setActiveOrganization(
				session.session.token,
				organization.id,
			);
			await setSessionCookie(ctx, {
				session: updatedSession,
				user: session.user,
			});
			type OrganizationReturn = O["teams"] extends { enabled: true }
				? {
						members: InferMember<O>[];
						invitations: InferInvitation<O>[];
						teams: Team[];
					} & InferOrganization<O>
				: {
						members: InferMember<O>[];
						invitations: InferInvitation<O>[];
					} & InferOrganization<O>;
			return ctx.json(organization as unknown as OrganizationReturn);
		},
	);
};

export const listOrganizations = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list",
		{
			method: "GET",
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "List all organizations",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											$ref: "#/components/schemas/Organization",
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
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const organizations = await adapter.listOrganizations(
				ctx.context.session.user.id,
			);
			return ctx.json(organizations);
		},
	);
