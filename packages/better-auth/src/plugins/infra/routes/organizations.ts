import type { User } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import type {
	Invitation,
	Member,
	Organization,
	Team,
	TeamMember,
} from "better-auth/plugins";
import z from "zod";
import { jwtMiddleware } from "../jwt";
import type { DashOptionsInternal } from "../types";

export const listOrganizations = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/list-organizations",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
			query: z
				.object({
					limit: z.number().or(z.string().transform(Number)).optional(),
					offset: z.number().or(z.string().transform(Number)).optional(),
					sortBy: z.enum(["createdAt", "name", "slug", "members"]).optional(),
					sortOrder: z.enum(["asc", "desc"]).optional(),
					search: z.string().optional(),
					startDate: z
						.date()
						.or(z.string().transform((val) => new Date(val)))
						.optional(),
					endDate: z
						.date()
						.or(z.string().transform((val) => new Date(val)))
						.optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const {
				limit = 10,
				offset = 0,
				sortBy = "createdAt",
				sortOrder = "desc",
				search,
			} = ctx.query || {};

			const where: {
				field: string;
				value: string | string[] | Date;
				operator?: "in" | "contains" | "starts_with" | "gte" | "lte";
				connector?: "OR";
			}[] = [];

			if (search && search.trim().length > 0) {
				const searchTerm = search.trim();
				where.push(
					{
						field: "name",
						value: searchTerm,
						operator: "starts_with",
						connector: "OR",
					},
					{
						field: "slug",
						value: searchTerm,
						operator: "starts_with",
						connector: "OR",
					},
				);
			}
			if (ctx.query?.startDate) {
				where.push({
					field: "createdAt",
					value: ctx.query.startDate,
					operator: "gte",
				});
			}
			if (ctx.query?.endDate) {
				where.push({
					field: "createdAt",
					value: ctx.query.endDate,
					operator: "lte",
				});
			}

			const [organizations, initialTotal] = await Promise.all([
				ctx.context.adapter.findMany<Organization & { member: Member[] }>({
					model: "organization",
					where,
					limit,
					offset,
					sortBy: { field: sortBy, direction: sortOrder },
					join: {
						member: true,
					},
				}),
				ctx.context.adapter.count({ model: "organization", where }),
			]);

			const withCounts = organizations.map((organization) => ({
				...organization,
				memberCount: organization.member.length,
			}));

			const allUserIds = new Set<string>();
			for (const organization of withCounts) {
				for (const member of organization.member.slice(0, 5)) {
					allUserIds.add(member.userId);
				}
			}

			const users = await ctx.context.adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: Array.from(allUserIds),
						operator: "in",
					},
				],
			});

			const userMap = new Map(users.map((u) => [u.id, u]));

			const withMembers = withCounts.map((organization) => {
				const members = organization.member
					.slice(0, 5)
					.map((m) => userMap.get(m.userId))
					.filter((u): u is User => u !== undefined)
					.map((u) => ({
						id: u.id,
						name: u.name,
						email: u.email,
						image: u.image,
					}));

				return {
					...organization,
					members,
				};
			});

			return {
				organizations: withMembers,
				total: initialTotal,
				offset,
				limit,
			};
		},
	);
};

export const getOrganizationOptions = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/options",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				return {
					teamsEnabled: false,
				};
			}

			return {
				teamsEnabled:
					organizationPlugin.options?.teams?.enabled &&
					organizationPlugin.options.teams.defaultTeam?.enabled !== false,
			};
		},
	);
};

export const getOrganization = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const orgs = await ctx.context.adapter.findMany<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: ctx.params.id,
					},
				],
				limit: 1,
			});
			const organization = orgs[0];

			if (!organization) {
				throw ctx.error("NOT_FOUND", { message: "Organization not found" });
			}

			const membersCount = await ctx.context.adapter.count({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organization.id,
					},
				],
			});

			return {
				...organization,
				memberCount: membersCount,
			} as Organization & { memberCount: number };
		},
	);
};

export const listOrganizationMembers = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/members",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const members = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: ctx.params.id,
					},
				],
			});

			const userIds = members.map((m) => m.userId);
			const users = userIds.length
				? await ctx.context.adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "id",
								value: userIds,
								operator: "in",
							},
						],
					})
				: [];

			// Get all accepted invitations for this organization to find who invited each member
			const invitations = await ctx.context.adapter.findMany<Invitation>({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: ctx.params.id,
					},
					{
						field: "status",
						value: "accepted",
					},
				],
			});

			// Get inviter user details
			const inviterIds = [
				...new Set(invitations.map((i) => i.inviterId).filter(Boolean)),
			];
			const inviters = inviterIds.length
				? await ctx.context.adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "id",
								value: inviterIds,
								operator: "in",
							},
						],
					})
				: [];

			const inviterById = new Map(inviters.map((u) => [u.id, u]));
			const userById = new Map(users.map((u) => [u.id, u]));

			// Map invitations by user email for quick lookup
			const invitationByEmail = new Map(
				invitations.map((i) => [i.email.toLowerCase(), i]),
			);

			const membersWithUsers = members.map((m) => {
				const user = userById.get(m.userId);
				const invitation = user
					? invitationByEmail.get(user.email.toLowerCase())
					: null;
				const inviter = invitation
					? inviterById.get(invitation.inviterId)
					: null;

				return {
					...m,
					user: user
						? {
								id: user.id,
								email: user.email,
								name: user.name,
								image: user.image || null,
							}
						: null,
					invitedBy: inviter
						? {
								id: inviter.id,
								name: inviter.name,
								email: inviter.email,
								image: inviter.image || null,
							}
						: null,
				};
			});

			return membersWithUsers;
		},
	);
};

export const listOrganizationInvitations = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/invitations",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const invitations = await ctx.context.adapter.findMany<Invitation>({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: ctx.params.id,
					},
				],
			});

			// Get all unique emails from invitations
			const emails = [
				...new Set(invitations.map((i) => i.email.toLowerCase())),
			];

			// Batch fetch all users by email
			const users = emails.length
				? await ctx.context.adapter.findMany<User>({
						model: "user",
						where: [
							{
								field: "email",
								value: emails,
								operator: "in",
							},
						],
					})
				: [];

			const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));

			// Map invitations with user details
			const invitationsWithUser = invitations.map((invitation) => {
				const user = userByEmail.get(invitation.email.toLowerCase());
				return {
					...invitation,
					user: user
						? {
								id: user.id,
								name: user.name,
								email: user.email,
								image: user.image || null,
							}
						: null,
				};
			});

			return invitationsWithUser;
		},
	);
};

export const deleteOrganization = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/delete",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				organizationId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;
			const { organizationId: bodyOrganizationId } = ctx.body;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			const orgOptions = organizationPlugin?.options || {};

			if (organizationId !== bodyOrganizationId) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization ID mismatch",
				});
			}

			const owners = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "role", value: "owner" },
				],
				sortBy: { field: "createdAt", direction: "asc" },
				limit: 1,
			});

			if (owners.length === 0) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			const owner = owners[0];
			const deletedByUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: owner!.userId }],
			});

			if (!deletedByUser) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			if (orgOptions?.organizationHooks?.beforeDeleteOrganization) {
				await orgOptions.organizationHooks.beforeDeleteOrganization({
					organization,
					user: deletedByUser,
				});
			}

			await ctx.context.adapter.delete<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (orgOptions?.organizationHooks?.afterDeleteOrganization) {
				await orgOptions.organizationHooks.afterDeleteOrganization({
					organization,
					user: deletedByUser,
				});
			}

			return {
				success: true,
			};
		},
	);
};

export const listOrganizationTeams = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/teams",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			try {
				const teams = await ctx.context.adapter.findMany<any>({
					model: "team",
					where: [
						{
							field: "organizationId",
							value: ctx.params.id,
						},
					],
				});
				const teamsWithMemberCounts = await Promise.all(
					teams.map(async (team) => {
						let memberCount = 0;
						try {
							memberCount = await ctx.context.adapter.count({
								model: "teamMember",
								where: [{ field: "teamId", value: team.id }],
							});
						} catch {
							memberCount = 0;
						}
						return {
							...team,
							memberCount,
						};
					}),
				);

				return teamsWithMemberCounts;
			} catch {
				return [];
			}
		},
	);
};

export const updateTeam = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/update-team",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				teamId: z.string(),
				name: z.string().optional(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin not enabled",
				});
			}

			const orgOptions = organizationPlugin.options || {};

			if (!orgOptions?.teams?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "Teams are not enabled",
				});
			}

			const existingTeam = await ctx.context.adapter.findOne<Team>({
				model: "team",
				where: [
					{ field: "id", value: ctx.body.teamId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!existingTeam) {
				throw ctx.error("NOT_FOUND", {
					message: "Team not found",
				});
			}

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			const owners = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "role", value: "owner" },
				],
				sortBy: { field: "createdAt", direction: "asc" },
				limit: 1,
			});

			if (owners.length === 0) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner not found",
				});
			}

			const owner = owners[0];
			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: owner!.userId }],
			});

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			let updateData: { name?: string; updatedAt: Date } = {
				updatedAt: new Date(),
			};

			if (ctx.body.name) {
				updateData.name = ctx.body.name;
			}

			if (orgOptions?.organizationHooks?.beforeUpdateTeam) {
				const response = await orgOptions.organizationHooks.beforeUpdateTeam({
					team: existingTeam,
					updates: updateData,
					user,
					organization,
				});
				if (response && typeof response === "object" && "data" in response) {
					updateData = {
						...updateData,
						...response.data,
					};
				}
			}

			const team = await ctx.context.adapter.update<Team>({
				model: "team",
				where: [{ field: "id", value: ctx.body.teamId }],
				update: updateData,
			});

			if (orgOptions?.organizationHooks?.afterUpdateTeam) {
				await orgOptions.organizationHooks.afterUpdateTeam({
					team,
					user,
					organization,
				});
			}

			return team;
		},
	);
};

export const deleteTeam = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/delete-team",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				teamId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin not enabled",
				});
			}

			const orgOptions = organizationPlugin.options || {};

			if (!orgOptions?.teams?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "Teams are not enabled",
				});
			}

			const team = await ctx.context.adapter.findOne<Team>({
				model: "team",
				where: [
					{ field: "id", value: ctx.body.teamId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!team) {
				throw ctx.error("NOT_FOUND", {
					message: "Team not found",
				});
			}

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			if (orgOptions?.teams?.allowRemovingAllTeams === false) {
				const teamsCount = await ctx.context.adapter.count({
					model: "team",
					where: [{ field: "organizationId", value: organizationId }],
				});

				if (teamsCount <= 1) {
					throw ctx.error("BAD_REQUEST", {
						message: "Cannot remove the last team in the organization",
					});
				}
			}

			const owners = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "role", value: "owner" },
				],
				sortBy: { field: "createdAt", direction: "asc" },
				limit: 1,
			});

			if (owners.length === 0) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner not found",
				});
			}

			const owner = owners[0];
			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: owner!.userId }],
			});

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			if (orgOptions?.organizationHooks?.beforeDeleteTeam) {
				await orgOptions.organizationHooks.beforeDeleteTeam({
					team,
					user,
					organization,
				});
			}

			await ctx.context.adapter.delete({
				model: "team",
				where: [{ field: "id", value: ctx.body.teamId }],
			});

			if (orgOptions?.organizationHooks?.afterDeleteTeam) {
				await orgOptions.organizationHooks.afterDeleteTeam({
					team,
					user,
					organization,
				});
			}

			return { success: true };
		},
	);
};

export const createTeam = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/create-team",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				name: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin not enabled",
				});
			}

			const orgOptions = organizationPlugin.options || {};

			if (!orgOptions?.teams?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "Teams are not enabled",
				});
			}

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			if (orgOptions?.teams?.maximumTeams) {
				const teamsCount = await ctx.context.adapter.count({
					model: "team",
					where: [{ field: "organizationId", value: organizationId }],
				});

				const maxTeams =
					typeof orgOptions.teams.maximumTeams === "function"
						? await orgOptions.teams.maximumTeams({ organizationId })
						: orgOptions.teams.maximumTeams;

				if (teamsCount >= maxTeams) {
					throw ctx.error("BAD_REQUEST", {
						message: `Maximum number of teams (${maxTeams}) reached for this organization`,
					});
				}
			}

			const owners = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "role", value: "owner" },
				],
				sortBy: { field: "createdAt", direction: "asc" },
				limit: 1,
			});

			if (owners.length === 0) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner not found",
				});
			}

			const owner = owners[0];
			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: owner!.userId }],
			});

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			let teamData: { name: string; organizationId: string; createdAt: Date } =
				{
					name: ctx.body.name,
					organizationId,
					createdAt: new Date(),
				};

			if (orgOptions?.organizationHooks?.beforeCreateTeam) {
				const response = await orgOptions.organizationHooks.beforeCreateTeam({
					team: teamData,
					user,
					organization,
				});
				if (response && typeof response === "object" && "data" in response) {
					teamData = {
						...teamData,
						...response.data,
					};
				}
			}

			const team = await ctx.context.adapter.create<Team>({
				model: "team",
				data: teamData,
			});

			if (orgOptions?.organizationHooks?.afterCreateTeam) {
				await orgOptions.organizationHooks.afterCreateTeam({
					team,
					user,
					organization,
				});
			}

			return team;
		},
	);
};

export const listTeamMembers = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:orgId/teams/:teamId/members",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			try {
				const team = await ctx.context.adapter.findOne<Team>({
					model: "team",
					where: [
						{ field: "id", value: ctx.params.teamId },
						{ field: "organizationId", value: ctx.params.orgId },
					],
				});

				if (!team) {
					throw ctx.error("NOT_FOUND", {
						message: "Team not found",
					});
				}

				const teamMembers = await ctx.context.adapter.findMany<TeamMember>({
					model: "teamMember",
					where: [
						{
							field: "teamId",
							value: ctx.params.teamId,
						},
					],
				});

				const membersWithUsers = await Promise.all(
					teamMembers.map(async (tm) => {
						const user = await ctx.context.adapter.findOne<User>({
							model: "user",
							where: [{ field: "id", value: tm.userId }],
						});
						return {
							...tm,
							user: user
								? {
										id: user.id,
										name: user.name,
										email: user.email,
										image: user.image,
									}
								: null,
						};
					}),
				);

				return membersWithUsers;
			} catch (_e) {
				return [];
			}
		},
	);
};

export const addTeamMember = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/add-team-member",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				teamId: z.string(),
				userId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin not enabled",
				});
			}

			const orgOptions = organizationPlugin.options || {};

			if (!orgOptions?.teams?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "Teams are not enabled",
				});
			}

			const team = await ctx.context.adapter.findOne<Team>({
				model: "team",
				where: [
					{ field: "id", value: ctx.body.teamId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!team) {
				throw ctx.error("NOT_FOUND", {
					message: "Team not found",
				});
			}

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: ctx.body.userId }],
			});

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}

			const orgMember = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{ field: "userId", value: ctx.body.userId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!orgMember) {
				throw ctx.error("BAD_REQUEST", {
					message: "User is not a member of this organization",
				});
			}

			const existingTeamMember = await ctx.context.adapter.findOne<TeamMember>({
				model: "teamMember",
				where: [
					{ field: "teamId", value: ctx.body.teamId },
					{ field: "userId", value: ctx.body.userId },
				],
			});

			if (existingTeamMember) {
				throw ctx.error("BAD_REQUEST", {
					message: "User is already a member of this team",
				});
			}

			if (orgOptions?.teams?.maximumMembersPerTeam) {
				const teamMemberCount = await ctx.context.adapter.count({
					model: "teamMember",
					where: [{ field: "teamId", value: ctx.body.teamId }],
				});

				const maxMembers =
					typeof orgOptions.teams.maximumMembersPerTeam === "function"
						? await orgOptions.teams.maximumMembersPerTeam({
								teamId: ctx.body.teamId,
								organizationId,
							})
						: orgOptions.teams.maximumMembersPerTeam;

				if (teamMemberCount >= maxMembers) {
					throw ctx.error("BAD_REQUEST", {
						message: `Maximum number of team members (${maxMembers}) reached for this team`,
					});
				}
			}

			let teamMemberData: {
				teamId: string;
				userId: string;
				createdAt: Date;
			} = {
				teamId: ctx.body.teamId,
				userId: ctx.body.userId,
				createdAt: new Date(),
			};

			if (orgOptions?.organizationHooks?.beforeAddTeamMember) {
				const response = await orgOptions.organizationHooks.beforeAddTeamMember(
					{
						teamMember: teamMemberData,
						team,
						user,
						organization,
					},
				);
				if (response && typeof response === "object" && "data" in response) {
					teamMemberData = {
						...teamMemberData,
						...response.data,
					};
				}
			}

			const teamMember = await ctx.context.adapter.create<TeamMember>({
				model: "teamMember",
				data: teamMemberData,
			});

			if (orgOptions?.organizationHooks?.afterAddTeamMember) {
				await orgOptions.organizationHooks.afterAddTeamMember({
					teamMember,
					team,
					user,
					organization,
				});
			}

			return teamMember;
		},
	);
};

export const removeTeamMember = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/remove-team-member",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				teamId: z.string(),
				userId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin not enabled",
				});
			}

			const orgOptions = organizationPlugin.options || {};

			if (!orgOptions?.teams?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "Teams are not enabled",
				});
			}

			const team = await ctx.context.adapter.findOne<Team>({
				model: "team",
				where: [
					{ field: "id", value: ctx.body.teamId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!team) {
				throw ctx.error("NOT_FOUND", {
					message: "Team not found",
				});
			}

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: ctx.body.userId }],
			});

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}

			const teamMember = await ctx.context.adapter.findOne<TeamMember>({
				model: "teamMember",
				where: [
					{ field: "teamId", value: ctx.body.teamId },
					{ field: "userId", value: ctx.body.userId },
				],
			});

			if (!teamMember) {
				throw ctx.error("NOT_FOUND", {
					message: "User is not a member of this team",
				});
			}

			if (orgOptions?.organizationHooks?.beforeRemoveTeamMember) {
				await orgOptions.organizationHooks.beforeRemoveTeamMember({
					teamMember,
					team,
					user,
					organization,
				});
			}

			await ctx.context.adapter.delete({
				model: "teamMember",
				where: [
					{ field: "teamId", value: ctx.body.teamId },
					{ field: "userId", value: ctx.body.userId },
				],
			});

			if (orgOptions?.organizationHooks?.afterRemoveTeamMember) {
				await orgOptions.organizationHooks.afterRemoveTeamMember({
					teamMember,
					team,
					user,
					organization,
				});
			}

			return { success: true };
		},
	);
};

export const createOrganization = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/create",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						userId: z.string(),
						skipDefaultTeam: z.boolean().optional().default(false),
					}),
				),
			],
			body: z.object({
				name: z.string(),
				slug: z.string(),
				logo: z.string().optional(),
				defaultTeamName: z.string().optional(),
			}),
		},
		async (ctx) => {
			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;

			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin not enabled",
				});
			}

			const { userId } = ctx.context.payload;

			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: userId }],
			});

			if (!user) {
				throw ctx.error("BAD_REQUEST", {
					message: "User not found",
				});
			}

			const orgOptions = organizationPlugin.options || {};

			const existingOrganization =
				await ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [{ field: "slug", value: ctx.body.slug }],
				});

			if (existingOrganization) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization already exists",
				});
			}

			let orgData = {
				name: ctx.body.name,
				slug: ctx.body.slug,
				logo: ctx.body.logo,
			};

			if (orgOptions.organizationCreation?.beforeCreate) {
				const response = await orgOptions.organizationCreation.beforeCreate(
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
					orgData = {
						...orgData,
						...response.data,
					};
				}
			}

			if (orgOptions?.organizationHooks?.beforeCreateOrganization) {
				const response =
					await orgOptions?.organizationHooks.beforeCreateOrganization({
						organization: orgData,
						user,
					});
				if (response && typeof response === "object" && "data" in response) {
					orgData = {
						...orgData,
						...response.data,
					};
				}
			}

			const organization = await ctx.context.adapter.create<Organization>({
				model: "organization",
				data: {
					...orgData,
					createdAt: new Date(),
				},
			});

			let member: Member | undefined;

			let data = {
				userId: user.id,
				organizationId: organization.id,
				role: orgOptions.creatorRole || "owner",
			};

			if (orgOptions?.organizationHooks?.beforeAddMember) {
				const response = await orgOptions?.organizationHooks.beforeAddMember({
					member: {
						userId: user.id,
						organizationId: organization.id,
						role: orgOptions.creatorRole || "owner",
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					user,
					organization,
				});
				if (response && typeof response === "object" && "data" in response) {
					data = {
						...data,
						...response.data,
					};
				}
			}

			member = await ctx.context.adapter.create<Member>({
				model: "member",
				data: {
					userId: data.userId,
					organizationId: data.organizationId,
					role: data.role,
					createdAt: new Date(),
				},
			});

			if (orgOptions?.organizationHooks?.afterAddMember) {
				await orgOptions?.organizationHooks.afterAddMember({
					member,
					user,
					organization,
				});
			}

			if (
				orgOptions?.teams?.enabled &&
				orgOptions.teams.defaultTeam?.enabled !== false &&
				!ctx.context.payload.skipDefaultTeam
			) {
				let teamData = {
					organizationId: organization.id,
					name: ctx.body.defaultTeamName || `${organization.name}`,
					createdAt: new Date(),
				};

				if (orgOptions?.organizationHooks?.beforeCreateTeam) {
					const response = await orgOptions?.organizationHooks.beforeCreateTeam(
						{
							team: {
								organizationId: organization.id,
								name: teamData.name,
							},
							user,
							organization,
						},
					);
					if (response && typeof response === "object" && "data" in response) {
						teamData = {
							...teamData,
							...response.data,
						};
					}
				}

				const defaultTeam =
					(await orgOptions.teams.defaultTeam?.customCreateDefaultTeam?.(
						organization,
						ctx as any,
					)) ||
					(await ctx.context.adapter.create<any>({
						model: "team",
						data: teamData,
					}));

				const teamMember = await ctx.context.adapter.findOne<any>({
					model: "teamMember",
					where: [
						{ field: "teamId", value: defaultTeam.id },
						{ field: "userId", value: user.id },
					],
				});

				if (!teamMember) {
					await ctx.context.adapter.create({
						model: "teamMember",
						data: {
							teamId: defaultTeam.id,
							userId: user.id,
							role: "owner" as any,
						},
					});
				}

				if (orgOptions?.organizationHooks?.afterCreateTeam) {
					await orgOptions?.organizationHooks.afterCreateTeam({
						team: defaultTeam,
						user,
						organization,
					});
				}
			}

			if (orgOptions.organizationCreation?.afterCreate) {
				await orgOptions.organizationCreation.afterCreate(
					{
						organization,
						user,
						member,
					},
					ctx.request,
				);
			}

			if (orgOptions?.organizationHooks?.afterCreateOrganization) {
				await orgOptions?.organizationHooks.afterCreateOrganization({
					organization,
					user,
					member,
				});
			}

			return {
				...organization,
				members: [member],
			};
		},
	);
};

export const updateOrganization = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/update",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z
				.object({
					logo: z.string().url().optional(),
					name: z.string().optional(),
					slug: z.string().optional(),
					metadata: z.string().optional(),
				})
				.passthrough(),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			const orgOptions = organizationPlugin?.options || {};

			if (ctx.body.slug) {
				const existingOrg = await ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [{ field: "slug", value: ctx.body.slug }],
				});
				// Only throw error if slug exists AND belongs to a different organization
				if (existingOrg && existingOrg.id !== organizationId) {
					throw ctx.error("BAD_REQUEST", { message: "Slug already exists" });
				}
			}

			const owners = await ctx.context.adapter.findMany<Member>({
				model: "member",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "role", value: "owner" },
				],
				sortBy: { field: "createdAt", direction: "asc" },
				limit: 1,
			});

			if (owners.length === 0) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			const owner = owners[0];
			const updatedByUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: owner!.userId }],
			});

			if (!updatedByUser) {
				throw ctx.error("NOT_FOUND", {
					message: "Owner user not found",
				});
			}

			let updateData = { ...ctx.body };

			if (orgOptions?.organizationHooks?.beforeUpdateOrganization) {
				const response =
					await orgOptions.organizationHooks.beforeUpdateOrganization({
						organization: updateData,
						user: updatedByUser,
					});
				if (response && typeof response === "object" && "data" in response) {
					updateData = {
						...updateData,
						...response.data,
					};
				}
			}

			const organization = await ctx.context.adapter.update<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
				update: updateData,
			});

			if (orgOptions?.organizationHooks?.afterUpdateOrganization) {
				await orgOptions.organizationHooks.afterUpdateOrganization({
					organization,
					user: updatedByUser,
				});
			}

			return organization;
		},
	);
};

export const addMember = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/add-member",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				userId: z.string(),
				role: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			const orgOptions = organizationPlugin?.options || {};

			const organization = await ctx.context.adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: "id", value: organizationId }],
			});

			if (!organization) {
				throw ctx.error("NOT_FOUND", { message: "Organization not found" });
			}

			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: ctx.body.userId }],
			});

			if (!user) {
				throw ctx.error("NOT_FOUND", { message: "User not found" });
			}

			let memberData = {
				organizationId: organizationId,
				userId: ctx.body.userId,
				role: ctx.body.role,
				createdAt: new Date(),
			};

			if (orgOptions?.organizationHooks?.beforeAddMember) {
				const response = await orgOptions.organizationHooks.beforeAddMember({
					member: memberData,
					user,
					organization,
				});

				if (response && typeof response === "object" && "data" in response) {
					memberData = {
						...memberData,
						...response.data,
					};
				}
			}

			const member = await ctx.context.adapter.create<Member>({
				model: "member",
				data: memberData,
			});

			if (orgOptions?.organizationHooks?.afterAddMember) {
				await orgOptions.organizationHooks.afterAddMember({
					member,
					user,
					organization,
				});
			}

			return member;
		},
	);
};

export const removeMember = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/remove-member",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				memberId: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			const orgOptions = organizationPlugin?.options || {};

			// Find the member to ensure it belongs to this organization
			const member = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{ field: "id", value: ctx.body.memberId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!member) {
				throw ctx.error("NOT_FOUND", {
					message: "Member not found",
				});
			}

			const [user, organization] = await Promise.all([
				ctx.context.adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: member.userId }],
				}),
				ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [{ field: "id", value: organizationId }],
				}),
			]);

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			if (orgOptions?.organizationHooks?.beforeRemoveMember) {
				await orgOptions.organizationHooks.beforeRemoveMember({
					member,
					user,
					organization,
				});
			}

			if (orgOptions?.teams?.enabled) {
				const teamsInOrg = await ctx.context.adapter.findMany<Team>({
					model: "team",
					where: [{ field: "organizationId", value: organizationId }],
				});

				if (teamsInOrg.length > 0) {
					const teamIds = teamsInOrg.map((t) => t.id);
					await ctx.context.adapter.deleteMany({
						model: "teamMember",
						where: [
							{ field: "userId", value: member.userId },
							{ field: "teamId", value: teamIds, operator: "in" },
						],
					});
				}
			}

			await ctx.context.adapter.delete({
				model: "member",
				where: [{ field: "id", value: ctx.body.memberId }],
			});

			if (orgOptions?.organizationHooks?.afterRemoveMember) {
				await orgOptions.organizationHooks.afterRemoveMember({
					member,
					user,
					organization,
				});
			}

			return { success: true };
		},
	);
};

export const updateMemberRole = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/update-member-role",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
					}),
				),
			],
			body: z.object({
				memberId: z.string(),
				role: z.string(),
			}),
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			const orgOptions = organizationPlugin?.options || {};

			// Find the member to ensure it belongs to this organization
			const existingMember = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{ field: "id", value: ctx.body.memberId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!existingMember) {
				throw ctx.error("NOT_FOUND", {
					message: "Member not found",
				});
			}

			const [user, organization] = await Promise.all([
				ctx.context.adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: existingMember.userId }],
				}),
				ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [{ field: "id", value: organizationId }],
				}),
			]);

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "User not found",
				});
			}

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			const previousRole = existingMember.role;
			let newRole = ctx.body.role;

			if (orgOptions?.organizationHooks?.beforeUpdateMemberRole) {
				const response =
					await orgOptions.organizationHooks.beforeUpdateMemberRole({
						member: existingMember,
						user,
						organization,
						role: newRole,
					});
				if (response && typeof response === "object" && "data" in response) {
					newRole = response.data.role || newRole;
				}
			}

			// Update the member's role
			const member = await ctx.context.adapter.update<Member>({
				model: "member",
				where: [{ field: "id", value: ctx.body.memberId }],
				update: { role: newRole },
			});

			if (orgOptions?.organizationHooks?.afterUpdateMemberRole) {
				await orgOptions.organizationHooks.afterUpdateMemberRole({
					member,
					user,
					organization,
					previousRole,
				});
			}

			return member;
		},
	);
};

export const inviteMember = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/invite-member",
		{
			method: "POST",
			body: z.object({
				email: z.string(),
				role: z.string(),
				invitedBy: z.string(),
			}),
			use: [
				jwtMiddleware(
					options,
					z.object({ organizationId: z.string(), invitedBy: z.string() }),
				),
			],
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;
			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			if (!organizationPlugin.options?.sendInvitationEmail) {
				throw ctx.error("BAD_REQUEST", {
					message: "Invitation email is not enabled",
				});
			}
			const invitedBy = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: ctx.context.payload.invitedBy }],
			});
			if (!invitedBy) {
				throw ctx.error("BAD_REQUEST", {
					message: "Invited by user not found",
				});
			}
			const invitation = await organizationPlugin.endpoints.createInvitation({
				headers: ctx.request?.headers,
				body: {
					email: ctx.body.email,
					role: ctx.body.role as any,
					organizationId,
				},
				context: {
					...ctx.context,
					session: {
						user: invitedBy,
						session: {
							userId: ctx.context.payload.invitedBy,
						},
					},
					orgOptions: organizationPlugin.options,
				},
			});
			return invitation;
		},
	);
};

export const checkUserByEmail = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/check-user-by-email",
		{
			method: "POST",
			body: z.object({
				email: z.string(),
			}),
			use: [jwtMiddleware(options, z.object({ organizationId: z.string() }))],
		},
		async (ctx) => {
			const { organizationId } = ctx.context.payload;

			const user = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: ctx.body.email }],
			});

			if (!user) {
				return { exists: false, user: null, isAlreadyMember: false };
			}

			// Check if user is already a member
			const existingMember = await ctx.context.adapter.findOne<Member>({
				model: "member",
				where: [
					{ field: "userId", value: user.id },
					{ field: "organizationId", value: organizationId },
				],
			});

			return {
				exists: true,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
				isAlreadyMember: !!existingMember,
			};
		},
	);
};

export const cancelInvitation = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/cancel-invitation",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
						invitationId: z.string(),
					}),
				),
			],
			body: z.object({
				invitationId: z.string(),
			}),
		},
		async (ctx) => {
			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			) as any;
			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin is not enabled",
				});
			}

			const orgOptions = organizationPlugin.options || {};
			const { invitationId, organizationId } = ctx.context.payload;

			// Find the invitation to get details
			const invitation = await ctx.context.adapter.findOne<Invitation>({
				model: "invitation",
				where: [{ field: "id", value: invitationId }],
			});

			if (!invitation) {
				throw ctx.error("NOT_FOUND", {
					message: "Invitation not found",
				});
			}

			const [user, organization] = await Promise.all([
				ctx.context.adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: invitation.inviterId }],
				}),
				ctx.context.adapter.findOne<Organization>({
					model: "organization",
					where: [{ field: "id", value: organizationId }],
				}),
			]);

			if (!user) {
				throw ctx.error("NOT_FOUND", {
					message: "Inviter user not found",
				});
			}

			if (!organization) {
				throw ctx.error("NOT_FOUND", {
					message: "Organization not found",
				});
			}

			if (orgOptions?.organizationHooks?.beforeCancelInvitation) {
				await orgOptions.organizationHooks.beforeCancelInvitation({
					invitation,
					organization,
					cancelledBy: user,
				});
			}

			await ctx.context.adapter.update({
				model: "invitation",
				where: [{ field: "id", value: invitationId }],
				update: {
					status: "canceled",
				},
			});

			if (orgOptions?.organizationHooks?.afterCancelInvitation) {
				await orgOptions.organizationHooks.afterCancelInvitation({
					invitation: { ...invitation, status: "canceled" },
					organization,
					cancelledBy: user,
				});
			}

			return { success: true };
		},
	);
};

export const listOrganizationSsoProviders = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/sso-providers",
		{
			method: "GET",
			use: [jwtMiddleware(options)],
		},
		async (ctx) => {
			const ssoPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "sso",
			);

			if (!ssoPlugin) {
				return [];
			}

			try {
				const providers = await ctx.context.adapter.findMany<{
					id: string;
					providerId: string;
					issuer: string;
					domain: string;
					oidcConfig?: unknown;
					samlConfig?: unknown;
					organizationId: string;
					userId: string | null;
					createdAt: Date;
					updatedAt: Date;
				}>({
					model: "ssoProvider",
					where: [
						{
							field: "organizationId",
							value: ctx.params.id,
						},
					],
				});

				return providers;
			} catch {
				// Model may not exist if SSO plugin is not properly configured
				return [];
			}
		},
	);
};

export const createSsoProvider = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/sso-provider/create",
		{
			method: "POST",
			use: [jwtMiddleware(options)],
			body: z.object({
				providerId: z.string(),
				domain: z.string(),
				protocol: z.enum(["SAML", "OIDC"]),
				userId: z.string(), // User who will own this SSO config
				// SAML config
				samlConfig: z
					.object({
						idpMetadata: z
							.object({
								metadata: z.string().optional(), // XML metadata from IdP
								metadataUrl: z.string().optional(), // Or URL to fetch metadata
							})
							.optional(),
						entryPoint: z.string().optional(),
						cert: z.string().optional(),
						entityId: z.string().optional(), // IdP entity ID (custom SAML)
						// Attribute mapping for SAML assertions
						mapping: z
							.object({
								id: z.string().optional(),
								email: z.string().optional(),
								emailVerified: z.string().optional(),
								name: z.string().optional(),
								firstName: z.string().optional(),
								lastName: z.string().optional(),
								extraFields: z.record(z.string(), z.any()).optional(),
							})
							.optional(),
					})
					.optional(),
				// OIDC config
				oidcConfig: z
					.object({
						clientId: z.string(),
						clientSecret: z.string(),
						discoveryUrl: z.string().optional(),
						issuer: z.string().optional(),
						// Claim mapping for OIDC tokens
						mapping: z
							.object({
								id: z.string().optional(),
								email: z.string().optional(),
								emailVerified: z.string().optional(),
								name: z.string().optional(),
								image: z.string().optional(),
								extraFields: z.record(z.string(), z.any()).optional(),
							})
							.optional(),
					})
					.optional(),
			}),
		},
		async (ctx) => {
			const ssoPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "sso",
			) as
				| { options?: { domainVerification?: { enabled?: boolean } } }
				| undefined;

			if (!ssoPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "SSO plugin is not enabled",
				});
			}

			const organizationId = ctx.params.id;
			const { providerId, domain, protocol, samlConfig, oidcConfig, userId } =
				ctx.body;

			// Check if provider ID already exists
			try {
				const existingProvider = await ctx.context.adapter.findOne<{
					id: string;
					providerId: string;
				}>({
					model: "ssoProvider",
					where: [{ field: "providerId", value: providerId }],
				});

				if (existingProvider) {
					throw ctx.error("BAD_REQUEST", {
						message: "SSO provider with this ID already exists",
					});
				}
			} catch (e) {
				// Rethrow if it's our error
				if (e && typeof e === "object" && "message" in e) {
					throw e;
				}
				// Otherwise model might not exist, continue
			}

			// Generate verification token if domain verification is enabled
			const domainVerificationEnabled =
				ssoPlugin.options?.domainVerification?.enabled ?? false;
			const verificationToken = domainVerificationEnabled
				? `ba_verify_${crypto.randomUUID().replace(/-/g, "")}`
				: null;

			let issuer = domain;

			// Build SAML config with required fields for better-auth SSO plugin
			let samlConfigJson: string | null = null;
			if (protocol === "SAML" && samlConfig) {
				let idpMetadataXml: string | undefined =
					samlConfig.idpMetadata?.metadata;

				if (!idpMetadataXml && samlConfig.idpMetadata?.metadataUrl) {
					try {
						const metadataResponse = await fetch(
							samlConfig.idpMetadata.metadataUrl,
						);
						if (!metadataResponse.ok) {
							throw ctx.error("BAD_REQUEST", {
								message: `Failed to fetch IdP metadata from URL: ${metadataResponse.status} ${metadataResponse.statusText}`,
							});
						}
						idpMetadataXml = await metadataResponse.text();
					} catch (_e) {
						throw ctx.error("BAD_REQUEST", {
							message: "Failed to fetch IdP metadata from URL",
						});
					}
				}

				// Build idpMetadata based on what's available
				const idpMetadata = idpMetadataXml
					? { metadata: idpMetadataXml }
					: {
							// For custom SAML: /sign-in/sso requires these in idpMetadata (no root fallback)
							...(samlConfig.entryPoint
								? {
										singleSignOnService: [
											{
												Binding:
													"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
												Location: samlConfig.entryPoint,
											},
										],
									}
								: {}),
							...(samlConfig.cert ? { cert: samlConfig.cert } : {}),
						};

				samlConfigJson = JSON.stringify({
					// The issuer/entityId for the SP (Service Provider)
					// Using the SP metadata URL as the entity ID
					issuer:
						samlConfig.entityId ??
						`${ctx.context.baseURL}/sso/saml2/sp/metadata?providerId=${providerId}`,

					// Compute the callback URL (ACS endpoint) for SAML
					// This is where the IdP will send the SAML response
					callbackUrl: `${ctx.context.baseURL}/sso/saml2/callback/${providerId}`,

					// The IdP metadata is the XML metadata from the IdP
					idpMetadata,

					// The SP metadata is the XML metadata from the SP
					spMetadata: {},

					// Root-level fields used by /sso/saml2/callback/:providerId as fallbacks
					...(samlConfig.entryPoint
						? { entryPoint: samlConfig.entryPoint }
						: {}),
					...(samlConfig.cert ? { cert: samlConfig.cert } : {}),

					// Attribute mapping for SAML assertions
					...(samlConfig.mapping ? { mapping: samlConfig.mapping } : {}),
				});
			}

			let oidcConfigJson: string | null = null;
			if (protocol === "OIDC" && oidcConfig) {
				const issuerHint = oidcConfig.issuer || domain;
				const discoveryEndpoint =
					oidcConfig.discoveryUrl ||
					`https://${issuerHint}/.well-known/openid-configuration`;

				// Fetch OIDC discovery document to get required endpoints
				let discoveredConfig: {
					issuer?: string;
					authorization_endpoint?: string;
					token_endpoint?: string;
					userinfo_endpoint?: string;
					jwks_uri?: string;
					token_endpoint_auth_methods_supported?: string[];
				};

				try {
					const discoveryResponse = await fetch(discoveryEndpoint);
					if (!discoveryResponse.ok) {
						throw ctx.error("BAD_REQUEST", {
							message: `OIDC discovery failed: ${discoveryResponse.status} ${discoveryResponse.statusText}`,
							code: "OIDC_DISCOVERY_FAILED",
						});
					}
					discoveredConfig = await discoveryResponse.json();
				} catch (e) {
					ctx.context.logger?.error?.("OIDC discovery failed", {
						discoveryEndpoint,
						error: e,
					});
					throw ctx.error("BAD_REQUEST", {
						message: `OIDC discovery failed: Unable to fetch discovery document from ${discoveryEndpoint}`,
						code: "OIDC_DISCOVERY_FAILED",
					});
				}

				issuer = discoveredConfig.issuer || `https://${issuerHint}`;

				// Determine token endpoint authentication method
				let tokenEndpointAuthentication:
					| "client_secret_basic"
					| "client_secret_post" = "client_secret_basic";
				const supportedMethods =
					discoveredConfig.token_endpoint_auth_methods_supported;
				if (supportedMethods?.length) {
					if (supportedMethods.includes("client_secret_basic")) {
						tokenEndpointAuthentication = "client_secret_basic";
					} else if (supportedMethods.includes("client_secret_post")) {
						tokenEndpointAuthentication = "client_secret_post";
					}
				}

				oidcConfigJson = JSON.stringify({
					// Credentials
					clientId: oidcConfig.clientId,
					clientSecret: oidcConfig.clientSecret,

					// Issuer (must match the issuer claim in ID tokens)
					issuer,

					// Discovery endpoint
					discoveryEndpoint,

					// Required endpoints for sign-in and callback
					authorizationEndpoint: discoveredConfig.authorization_endpoint,

					// tokenEndpoint - required to exchange code for tokens
					tokenEndpoint: discoveredConfig.token_endpoint,

					// jwksEndpoint - required to validate ID token signature
					jwksEndpoint: discoveredConfig.jwks_uri,

					// Optional but useful endpoints
					userInfoEndpoint: discoveredConfig.userinfo_endpoint,

					// Token endpoint authentication method
					tokenEndpointAuthentication,

					// Enable PKCE by default for security
					pkce: true,

					// Claim mapping for OIDC tokens
					...(oidcConfig.mapping ? { mapping: oidcConfig.mapping } : {}),
				});
			}

			// Create the SSO provider directly in the database
			const newProvider = await ctx.context.adapter.create<{
				id: string;
				providerId: string;
				issuer: string;
				domain: string;
				organizationId: string;
				userId: string | null;
				oidcConfig: string | null;
				samlConfig: string | null;
				domainVerified: boolean;
				domainVerificationToken: string | null;
				createdAt: Date;
				updatedAt: Date;
			}>({
				model: "ssoProvider",
				data: {
					providerId,
					issuer,
					domain,
					organizationId,
					userId, // User who owns this SSO config (from setup link)
					oidcConfig: oidcConfigJson,
					samlConfig: samlConfigJson,
					domainVerified: false,
					domainVerificationToken: verificationToken,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			return {
				success: true,
				provider: {
					id: newProvider.id,
					providerId: newProvider.providerId,
					domain: newProvider.domain,
				},
				// Return verification token for domain verification
				domainVerification: {
					txtRecordName: `better-auth-token-${providerId}`,
					verificationToken,
				},
			};
		},
	);
};

// Helper to generate random string (similar to better-auth's generateRandomString)
function generateRandomString(length: number): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	const randomValues = new Uint8Array(length);
	crypto.getRandomValues(randomValues);
	for (let i = 0; i < length; i++) {
		result += chars[randomValues[i]! % chars.length];
	}
	return result;
}

export const requestSsoVerificationToken = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/sso-provider/request-verification-token",
		{
			method: "POST",
			use: [jwtMiddleware(options)],
			body: z.object({
				providerId: z.string(),
			}),
		},
		async (ctx) => {
			const ssoPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "sso",
			) as any & {
				options?: {
					domainVerification?: { enabled?: boolean; tokenPrefix?: string };
				};
			};

			if (!ssoPlugin || !ssoPlugin.options?.domainVerification?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "SSO plugin with domain verification is not enabled",
				});
			}

			const organizationId = ctx.params.id;
			const { providerId } = ctx.body;

			// Find the provider
			const provider = await ctx.context.adapter.findOne<{
				id: string;
				providerId: string;
				domain: string;
				organizationId: string | null;
				domainVerified?: boolean;
			}>({
				model: "ssoProvider",
				where: [
					{ field: "providerId", value: providerId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!provider) {
				throw ctx.error("NOT_FOUND", {
					message: "SSO provider not found",
				});
			}

			if (provider.domainVerified) {
				throw ctx.error("BAD_REQUEST", {
					message: "Domain has already been verified",
				});
			}

			const tokenPrefix =
				ssoPlugin.options?.domainVerification?.tokenPrefix ||
				"better-auth-token";
			const verificationIdentifier = `${tokenPrefix}-${provider.providerId}`;

			// Check for existing active verification token
			const activeVerification = await ctx.context.adapter.findOne<{
				id: string;
				identifier: string;
				value: string;
				expiresAt: Date;
			}>({
				model: "verification",
				where: [
					{ field: "identifier", value: verificationIdentifier },
					{ field: "expiresAt", value: new Date(), operator: "gt" },
				],
			});

			if (activeVerification) {
				return {
					success: true,
					providerId: provider.providerId,
					domain: provider.domain,
					verificationToken: activeVerification.value,
					txtRecordName: verificationIdentifier,
					existingToken: true,
				};
			}

			// Generate new verification token
			const domainVerificationToken = generateRandomString(24);

			// Create new verification record
			await ctx.context.adapter.create({
				model: "verification",
				data: {
					identifier: verificationIdentifier,
					createdAt: new Date(),
					updatedAt: new Date(),
					value: domainVerificationToken,
					expiresAt: new Date(Date.now() + 3600 * 24 * 7 * 1000), // 1 week
				},
			});

			return {
				success: true,
				providerId: provider.providerId,
				domain: provider.domain,
				verificationToken: domainVerificationToken,
				txtRecordName: verificationIdentifier,
				existingToken: false,
			};
		},
	);
};

export const verifySsoProviderDomain = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/sso-provider/verify-domain",
		{
			method: "POST",
			use: [jwtMiddleware(options)],
			body: z.object({
				providerId: z.string(),
			}),
		},
		async (ctx) => {
			const ssoPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "sso",
			) as any & {
				options?: {
					domainVerification?: { enabled?: boolean; tokenPrefix?: string };
				};
			};

			if (!ssoPlugin || !ssoPlugin.options?.domainVerification?.enabled) {
				throw ctx.error("BAD_REQUEST", {
					message: "SSO plugin with domain verification is not enabled",
				});
			}

			const organizationId = ctx.params.id;
			const { providerId } = ctx.body;

			const tokenPrefix =
				ssoPlugin.options?.domainVerification?.tokenPrefix ||
				"better-auth-token";

			// Find the provider (including the domainVerificationToken)
			const provider = await ctx.context.adapter.findOne<{
				id: string;
				providerId: string;
				domain: string;
				organizationId: string | null;
				domainVerified?: boolean;
				domainVerificationToken?: string | null;
			}>({
				model: "ssoProvider",
				where: [
					{ field: "providerId", value: providerId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!provider) {
				throw ctx.error("NOT_FOUND", {
					message: "SSO provider not found",
				});
			}

			if (provider.domainVerified) {
				return {
					verified: true,
					message: "Domain has already been verified",
				};
			}

			// Get verification token - first check verification table, then fall back to provider record
			let verificationToken: string | null = null;
			const verificationIdentifier = `${tokenPrefix}-${provider.providerId}`;

			// Try verification table first
			const activeVerification = await ctx.context.adapter.findOne<{
				id: string;
				identifier: string;
				value: string;
				expiresAt: Date;
			}>({
				model: "verification",
				where: [
					{ field: "identifier", value: verificationIdentifier },
					{ field: "expiresAt", value: new Date(), operator: "gt" },
				],
			});

			if (activeVerification) {
				verificationToken = activeVerification.value;
			} else if (provider.domainVerificationToken) {
				// Fall back to token stored on provider record (from createSsoProvider)
				verificationToken = provider.domainVerificationToken;
			}

			if (!verificationToken) {
				throw ctx.error("NOT_FOUND", {
					message:
						"No pending domain verification exists. Please request a new verification token.",
				});
			}

			// Perform DNS lookup to verify the domain
			let records: string[] = [];
			let dns: typeof import("node:dns/promises");

			try {
				dns = await import("node:dns/promises");
			} catch (_error) {
				throw ctx.error("INTERNAL_SERVER_ERROR", {
					message: "Unable to verify domain ownership due to server error",
				});
			}

			try {
				// Extract hostname from domain (handle URLs like https://example.com)
				let hostname = provider.domain;
				try {
					const url = new URL(provider.domain);
					hostname = url.hostname;
				} catch {
					// If not a valid URL, use as-is (it's probably just a domain)
					hostname = provider.domain
						.replace(/^(https?:\/\/)?/, "")
						.split("/")[0]!;
				}

				// Query TXT records at the root domain
				const dnsRecords = await dns.resolveTxt(
					`${verificationIdentifier}.${hostname}`,
				);
				records = dnsRecords.flat();
			} catch (_error) {
				// DNS resolution failed
				return {
					verified: false,
					message:
						"Unable to verify domain ownership. DNS record not found or DNS resolution failed.",
				};
			}

			// Look for our verification record: {identifier}={token}
			const expectedRecord = `${verificationIdentifier}=${verificationToken}`;
			const record = records.find((r) => r.includes(expectedRecord));

			if (!record) {
				return {
					verified: false,
					message:
						"Unable to verify domain ownership. The TXT record was not found. It may take up to 48 hours for DNS changes to propagate.",
				};
			}

			// Mark the domain as verified
			await ctx.context.adapter.update({
				model: "ssoProvider",
				where: [{ field: "providerId", value: provider.providerId }],
				update: {
					domainVerified: true,
				},
			});

			return {
				verified: true,
				message: "Domain ownership verified successfully",
			};
		},
	);
};

export const deleteSsoProvider = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/:id/sso-provider/delete",
		{
			method: "POST",
			use: [jwtMiddleware(options)],
			body: z.object({
				providerId: z.string(),
			}),
		},
		async (ctx) => {
			const organizationId = ctx.params.id;
			const { providerId } = ctx.body;

			// Find the provider
			const provider = await ctx.context.adapter.findOne<{
				id: string;
				providerId: string;
				organizationId: string | null;
			}>({
				model: "ssoProvider",
				where: [
					{ field: "providerId", value: providerId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (!provider) {
				throw ctx.error("NOT_FOUND", {
					message: "SSO provider not found",
				});
			}

			// Delete the provider
			await ctx.context.adapter.delete({
				model: "ssoProvider",
				where: [{ field: "id", value: provider.id }],
			});

			return {
				success: true,
				message: "SSO provider deleted successfully",
			};
		},
	);
};

export const resendInvitation = (options: DashOptionsInternal) => {
	return createAuthEndpoint(
		"/dash/organization/resend-invitation",
		{
			method: "POST",
			use: [
				jwtMiddleware(
					options,
					z.object({
						organizationId: z.string(),
						invitationId: z.string(),
					}),
				),
			],
			body: z.object({
				invitationId: z.string(),
			}),
		},
		async (ctx) => {
			const organizationPlugin = ctx.context.options.plugins?.find(
				(p) => p.id === "organization",
			);
			if (!organizationPlugin) {
				throw ctx.error("BAD_REQUEST", {
					message: "Organization plugin is not enabled",
				});
			}

			const { invitationId, organizationId } = ctx.context.payload;

			// Find the invitation
			const invitation = await ctx.context.adapter.findOne<Invitation>({
				model: "invitation",
				where: [{ field: "id", value: invitationId }],
			});

			if (!invitation) {
				throw ctx.error("NOT_FOUND", {
					message: "Invitation not found",
				});
			}

			if (invitation.status !== "pending") {
				throw ctx.error("BAD_REQUEST", {
					message: "Only pending invitations can be resent",
				});
			}

			// Get the inviter user
			const invitedByUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: invitation.inviterId }],
			});

			if (!invitedByUser) {
				throw ctx.error("BAD_REQUEST", {
					message: "Inviter user not found",
				});
			}

			// Use the createInvitation endpoint with resend flag
			if (!organizationPlugin.endpoints?.createInvitation) {
				throw ctx.error("INTERNAL_SERVER_ERROR", {
					message: "Organization plugin endpoints not available",
				});
			}

			const _result = await organizationPlugin.endpoints.createInvitation({
				headers: ctx.request?.headers,
				body: {
					email: invitation.email,
					role: invitation.role as any,
					organizationId,
					resend: true,
				},
				context: {
					...ctx.context,
					session: {
						user: invitedByUser,
						session: {
							userId: invitation.inviterId,
						},
					},
					orgOptions: organizationPlugin.options,
				},
			});

			return { success: true };
		},
	);
};
