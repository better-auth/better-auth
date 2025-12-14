import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { BetterAuthError } from "@better-auth/core/error";
import { parseJSON } from "../../client/parser";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type { Session, User } from "../../types";
import { getDate } from "../../utils/date";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	InferTeam,
	InvitationInput,
	Member,
	MemberInput,
	OrganizationInput,
	Team,
	TeamInput,
	TeamMember,
} from "./schema";
import type { OrganizationOptions } from "./types";

export const getOrgAdapter = <O extends OrganizationOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	return {
		findOrganizationBySlug: async (slug: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.findOne<InferOrganization<O, false>>({
				model: "organization",
				where: [
					{
						field: "slug",
						value: slug,
					},
				],
			});
			return organization;
		},
		createOrganization: async (data: {
			organization: OrganizationInput &
				// This represents the additional fields from the plugin options
				Record<string, any>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.create<
				OrganizationInput,
				InferOrganization<O, false>
			>({
				model: "organization",
				data: {
					...data.organization,
					metadata: data.organization.metadata
						? JSON.stringify(data.organization.metadata)
						: undefined,
				},
				forceAllowId: true,
			});

			return {
				...organization,
				metadata:
					organization.metadata && typeof organization.metadata === "string"
						? JSON.parse(organization.metadata)
						: undefined,
			} as typeof organization;
		},
		findMemberByEmail: async (data: {
			email: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const user = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: data.email.toLowerCase(),
					},
				],
			});
			if (!user) {
				return null;
			}
			const member = await adapter.findOne<InferMember<O, false>>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: data.organizationId,
					},
					{
						field: "userId",
						value: user.id,
					},
				],
			});
			if (!member) {
				return null;
			}
			return {
				...member,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		listMembers: async (data: {
			organizationId?: string | undefined;
			limit?: number | undefined;
			offset?: number | undefined;
			sortBy?: string | undefined;
			sortOrder?: ("asc" | "desc") | undefined;
			filter?:
				| {
						field: string;
						operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains";
						value: any;
				  }
				| undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const members = await Promise.all([
				adapter.findMany<InferMember<O, false>>({
					model: "member",
					where: [
						{ field: "organizationId", value: data.organizationId },
						...(data.filter?.field
							? [
									{
										field: data.filter?.field,
										value: data.filter?.value,
									},
								]
							: []),
					],
					limit: data.limit || options?.membershipLimit || 100,
					offset: data.offset || 0,
					sortBy: data.sortBy
						? { field: data.sortBy, direction: data.sortOrder || "asc" }
						: undefined,
				}),
				adapter.count({
					model: "member",
					where: [
						{ field: "organizationId", value: data.organizationId },
						...(data.filter?.field
							? [
									{
										field: data.filter?.field,
										value: data.filter?.value,
									},
								]
							: []),
					],
				}),
			]);
			const users = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: members[0].map((member) => member.userId),
						operator: "in",
					},
				],
			});
			return {
				members: members[0].map((member) => {
					const user = users.find((user) => user.id === member.userId);
					if (!user) {
						throw new BetterAuthError(
							"Unexpected error: User not found for member",
						);
					}
					return {
						...member,
						user: {
							id: user.id,
							name: user.name,
							email: user.email,
							image: user.image,
						},
					};
				}),
				total: members[1],
			};
		},
		findMemberByOrgId: async (data: {
			userId: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findOne<
				InferMember<O, false> & { user: User }
			>({
				model: "member",
				where: [
					{
						field: "userId",
						value: data.userId,
					},
					{
						field: "organizationId",
						value: data.organizationId,
					},
				],
				join: {
					user: true,
				},
			});
			if (!result || !result.user) return null;
			const { user, ...member } = result;

			return {
				...member,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		findMemberById: async (memberId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findOne<
				InferMember<O, false> & { user: User }
			>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
				join: {
					user: true,
				},
			});
			if (!result) {
				return null;
			}
			const { user, ...member } = result;

			return {
				...(member as unknown as InferMember<O, false>),
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		createMember: async (
			data: Omit<MemberInput, "id"> &
				// Additional fields from the plugin options
				Record<string, any>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.create<
				typeof data,
				Member & InferAdditionalFieldsFromPluginOptions<"member", O, false>
			>({
				model: "member",
				data: {
					...data,
					createdAt: new Date(),
				},
			});
			return member;
		},
		updateMember: async (memberId: string, role: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.update<InferMember<O, false>>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
				update: {
					role,
				},
			});
			return member;
		},
		deleteMember: async ({
			memberId,
			organizationId,
			userId: _userId,
		}: {
			memberId: string;
			organizationId: string;
			userId?: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			let userId: string;
			if (!_userId) {
				const member = await adapter.findOne<Member>({
					model: "member",
					where: [{ field: "id", value: memberId }],
				});
				if (!member) {
					throw new BetterAuthError("Member not found");
				}
				userId = member.userId;
			} else {
				userId = _userId;
			}
			const member = await adapter.delete<InferMember<O, false>>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
			});
			// remove member from all teams they're part of
			if (options?.teams?.enabled) {
				const teams = await adapter.findMany<Team>({
					model: "team",
					where: [{ field: "organizationId", value: organizationId }],
				});
				await Promise.all(
					teams.map((team) =>
						adapter.deleteMany({
							model: "teamMember",
							where: [
								{ field: "teamId", value: team.id },
								{ field: "userId", value: userId },
							],
						}),
					),
				);
			}
			return member;
		},
		updateOrganization: async (
			organizationId: string,
			data: Partial<OrganizationInput>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.update<InferOrganization<O, false>>({
				model: "organization",
				where: [
					{
						field: "id",
						value: organizationId,
					},
				],
				update: {
					...data,
					metadata:
						typeof data.metadata === "object"
							? JSON.stringify(data.metadata)
							: data.metadata,
				},
			});
			if (!organization) {
				return null;
			}
			return {
				...organization,
				metadata: organization.metadata
					? parseJSON<Record<string, any>>(organization.metadata)
					: undefined,
			};
		},
		deleteOrganization: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.deleteMany({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
					},
				],
			});
			await adapter.deleteMany({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: organizationId,
					},
				],
			});
			await adapter.delete<InferOrganization<O, false>>({
				model: "organization",
				where: [
					{
						field: "id",
						value: organizationId,
					},
				],
			});
			return organizationId;
		},
		setActiveOrganization: async (
			sessionToken: string,
			organizationId: string | null,
			ctx: GenericEndpointContext,
		) => {
			const session = await context.internalAdapter.updateSession(
				sessionToken,
				{
					activeOrganizationId: organizationId,
				},
			);
			return session as Session;
		},
		findOrganizationById: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.findOne<InferOrganization<O, false>>({
				model: "organization",
				where: [
					{
						field: "id",
						value: organizationId,
					},
				],
			});
			return organization;
		},
		checkMembership: async ({
			userId,
			organizationId,
		}: {
			userId: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne<InferMember<O, false>>({
				model: "member",
				where: [
					{
						field: "userId",
						value: userId,
					},
					{
						field: "organizationId",
						value: organizationId,
					},
				],
			});
			return member;
		},
		/**
		 * @requires db
		 */
		findFullOrganization: async ({
			organizationId,
			isSlug,
			includeTeams,
			membersLimit,
		}: {
			organizationId: string;
			isSlug?: boolean | undefined;
			includeTeams?: boolean | undefined;
			membersLimit?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findOne<
				InferOrganization<O, false> & {
					invitation: InferInvitation<O>[];
					member: InferMember<O>[];
					team: InferTeam<O>[] | undefined;
				}
			>({
				model: "organization",
				where: [{ field: isSlug ? "slug" : "id", value: organizationId }],
				join: {
					invitation: true,
					member: membersLimit ? { limit: membersLimit } : true,
					...(includeTeams ? { team: true } : {}),
				},
			});
			if (!result) {
				return null;
			}

			const {
				invitation: invitations,
				member: members,
				team: teams,
				...org
			} = result;
			const userIds = members.map((member) => member.userId);
			const users =
				userIds.length > 0
					? await adapter.findMany<User>({
							model: "user",
							where: [{ field: "id", value: userIds, operator: "in" }],
							limit: options?.membershipLimit || 100,
						})
					: [];

			const userMap = new Map(users.map((user) => [user.id, user]));
			const membersWithUsers = members.map((member) => {
				const user = userMap.get(member.userId);
				if (!user) {
					throw new BetterAuthError(
						"Unexpected error: User not found for member",
					);
				}
				return {
					...member,
					user: {
						id: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
					},
				};
			});

			return {
				...org,
				invitations,
				members: membersWithUsers,
				teams,
			};
		},
		listOrganizations: async (userId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findMany<
				InferMember<O, false> & { organization: InferOrganization<O, false> }
			>({
				model: "member",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
				join: {
					organization: true,
				},
			});

			if (!result || result.length === 0) {
				return [];
			}

			const organizations = result.map((member) => member.organization);

			return organizations;
		},
		createTeam: async (data: Omit<TeamInput, "id">) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.create<
				Omit<TeamInput, "id">,
				InferTeam<O, false>
			>({
				model: "team",
				data,
			});
			return team;
		},
		findTeamById: async <IncludeMembers extends boolean>({
			teamId,
			organizationId,
			includeTeamMembers,
		}: {
			teamId: string;
			organizationId?: string | undefined;
			includeTeamMembers?: IncludeMembers | undefined;
		}): Promise<
			| (InferTeam<O> &
					(IncludeMembers extends true ? { members: TeamMember[] } : {}))
			| null
		> => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findOne<
				InferTeam<O> & { teamMember: TeamMember[] }
			>({
				model: "team",
				where: [
					{
						field: "id",
						value: teamId,
					},
					...(organizationId
						? [
								{
									field: "organizationId",
									value: organizationId,
								},
							]
						: []),
				],
				join: {
					// In the future when `join` support is better, we can apply the `membershipLimit` here. Right now we're just querying 100.
					...(includeTeamMembers ? { teamMember: true } : {}),
				},
			});
			if (!result) {
				return null;
			}
			const { teamMember, ...team } = result;

			return {
				...team,
				...(includeTeamMembers ? { members: teamMember } : {}),
			} as any;
		},
		updateTeam: async (
			teamId: string,
			data: {
				name?: string | undefined;
				description?: string | undefined;
				status?: string | undefined;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			if ("id" in data) data.id = undefined;
			const team = await adapter.update<
				InferTeam<O, false> & InferAdditionalFieldsFromPluginOptions<"team", O>
			>({
				model: "team",
				where: [
					{
						field: "id",
						value: teamId,
					},
				],
				update: {
					...data,
				},
			});
			return team;
		},

		deleteTeam: async (teamId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.deleteMany({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: teamId,
					},
				],
			});

			const team = await adapter.delete<InferTeam<O, false>>({
				model: "team",
				where: [
					{
						field: "id",
						value: teamId,
					},
				],
			});
			return team;
		},

		listTeams: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const teams = await adapter.findMany<InferTeam<O, false>>({
				model: "team",
				where: [
					{
						field: "organizationId",
						value: organizationId,
					},
				],
			});
			return teams;
		},

		createTeamInvitation: async ({
			email,
			role,
			teamId,
			organizationId,
			inviterId,
			expiresIn = 1000 * 60 * 60 * 48, // Default expiration: 48 hours
		}: {
			email: string;
			role: string;
			teamId: string;
			organizationId: string;
			inviterId: string;
			expiresIn?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const expiresAt = getDate(expiresIn); // Get expiration date

			const invitation = await adapter.create<
				InvitationInput,
				InferInvitation<O>
			>({
				model: "invitation",
				data: {
					email,
					role,
					organizationId,
					teamId,
					inviterId,
					status: "pending",
					expiresAt,
				},
			});

			return invitation;
		},

		setActiveTeam: async (
			sessionToken: string,
			teamId: string | null,
			ctx: GenericEndpointContext,
		) => {
			const session = await context.internalAdapter.updateSession(
				sessionToken,
				{
					activeTeamId: teamId,
				},
			);
			return session as Session;
		},

		listTeamMembers: async (data: { teamId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const members = await adapter.findMany<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
				],
			});

			return members;
		},
		countTeamMembers: async (data: { teamId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "teamMember",
				where: [{ field: "teamId", value: data.teamId }],
			});
			return count;
		},
		countMembers: async (data: { organizationId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "member",
				where: [{ field: "organizationId", value: data.organizationId }],
			});
			return count;
		},
		listTeamsByUser: async (data: { userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const results = await adapter.findMany<TeamMember & { team: Team }>({
				model: "teamMember",
				where: [
					{
						field: "userId",
						value: data.userId,
					},
				],
				join: {
					team: true,
				},
			});

			return results.map((result) => result.team);
		},

		findTeamMember: async (data: { teamId: string; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
					{
						field: "userId",
						value: data.userId,
					},
				],
			});

			return member;
		},

		findOrCreateTeamMember: async (data: {
			teamId: string;
			userId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
					{
						field: "userId",
						value: data.userId,
					},
				],
			});

			if (member) return member;

			return await adapter.create<Omit<TeamMember, "id">, TeamMember>({
				model: "teamMember",
				data: {
					teamId: data.teamId,
					userId: data.userId,
					createdAt: new Date(),
				},
			});
		},
		removeTeamMember: async (data: { teamId: string; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// use `deleteMany` instead of `delete` since Prisma requires 1 unique field for normal `delete` operations
			// FKs do not count thus breaking the operation. As a solution, we'll use `deleteMany` instead.
			await adapter.deleteMany({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
					{
						field: "userId",
						value: data.userId,
					},
				],
			});
		},
		findInvitationsByTeamId: async (teamId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "teamId",
						value: teamId,
					},
				],
			});
			return invitations;
		},
		listUserInvitations: async (email: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<
				InferInvitation<O, false> & {
					organization: InferOrganization<O, false>;
				}
			>({
				model: "invitation",
				where: [{ field: "email", value: email.toLowerCase() }],
				join: {
					organization: true,
				},
			});
			return invitations.map(({ organization, ...inv }) => ({
				...inv,
				organizationName: organization.name,
			}));
		},
		createInvitation: async ({
			invitation,
			user,
		}: {
			invitation: {
				email: string;
				role: string;
				organizationId: string;
				teamIds: string[];
			} & Record<string, any>; // This represents the additionalFields for the invitation
			user: User;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const defaultExpiration = 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
				"sec",
			);
			const invite = await adapter.create<
				Omit<InvitationInput, "id">,
				InferInvitation<O, false>
			>({
				model: "invitation",
				data: {
					status: "pending",
					expiresAt,
					createdAt: new Date(),
					inviterId: user.id,
					...invitation,
					teamId:
						invitation.teamIds.length > 0 ? invitation.teamIds.join(",") : null,
				},
			});

			return invite;
		},
		findInvitationById: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitation = await adapter.findOne<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			return invitation;
		},
		findPendingInvitation: async (data: {
			email: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitation = await adapter.findMany<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "email",
						value: data.email.toLowerCase(),
					},
					{
						field: "organizationId",
						value: data.organizationId,
					},
					{
						field: "status",
						value: "pending",
					},
				],
			});
			return invitation.filter(
				(invite) => new Date(invite.expiresAt) > new Date(),
			);
		},
		findPendingInvitations: async (data: { organizationId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: data.organizationId,
					},
					{
						field: "status",
						value: "pending",
					},
				],
			});
			return invitations.filter(
				(invite) => new Date(invite.expiresAt) > new Date(),
			);
		},
		listInvitations: async (data: { organizationId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: data.organizationId,
					},
				],
			});
			return invitations;
		},
		updateInvitation: async (data: {
			invitationId: string;
			status: "accepted" | "canceled" | "rejected";
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitation = await adapter.update<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "id",
						value: data.invitationId,
					},
				],
				update: {
					status: data.status,
				},
			});
			return invitation;
		},
	};
};
