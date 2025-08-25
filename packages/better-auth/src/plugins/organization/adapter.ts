import type { Session, User } from "../../types";
import { getDate } from "../../utils/date";
import type { OrganizationOptions } from "./types";
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
import { BetterAuthError } from "../../error";
import type { AuthContext } from "../../init";
import parseJSON from "../../client/parser";
import { type InferAdditionalFieldsFromPluginOptions } from "../../db";

export const getOrgAdapter = <O extends OrganizationOptions>(
	context: AuthContext,
	options?: O,
) => {
	const adapter = context.adapter;
	return {
		findOrganizationBySlug: async (slug: string) => {
			const organization = await adapter.findOne<InferOrganization<O>>({
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
			const member = await adapter.findOne<Member>({
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
			organizationId?: string;
			limit?: number;
			offset?: number;
			sortBy?: string;
			sortOrder?: "asc" | "desc";
			filter?: {
				field: string;
				operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains";
				value: any;
			};
		}) => {
			const members = await Promise.all([
				adapter.findMany<Member>({
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
			const [member, user] = await Promise.all([
				await adapter.findOne<Member>({
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
				}),
				await adapter.findOne<User>({
					model: "user",
					where: [
						{
							field: "id",
							value: data.userId,
						},
					],
				}),
			]);
			if (!user || !member) {
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
		findMemberById: async (memberId: string) => {
			const member = await adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
			});
			if (!member) {
				return null;
			}
			const user = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: member.userId,
					},
				],
			});
			if (!user) {
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
		createMember: async (
			data: Omit<MemberInput, "id"> &
				// Additional fields from the plugin options
				Record<string, any>,
		) => {
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
			const member = await adapter.update<InferMember<O>>({
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
		deleteMember: async (memberId: string) => {
			const member = await adapter.delete<InferMember<O>>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
			});
			return member;
		},
		updateOrganization: async (
			organizationId: string,
			data: Partial<InferOrganization<O>>,
		) => {
			const organization = await adapter.update<InferOrganization<O>>({
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
			await adapter.delete({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
					},
				],
			});
			await adapter.delete({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: organizationId,
					},
				],
			});
			await adapter.delete<InferOrganization<O>>({
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
			const organization = await adapter.findOne<InferOrganization<O>>({
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
			const member = await adapter.findOne<InferMember<O>>({
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
			isSlug?: boolean;
			includeTeams?: boolean;
			membersLimit?: number;
		}) => {
			const org = await adapter.findOne<InferOrganization<O>>({
				model: "organization",
				where: [{ field: isSlug ? "slug" : "id", value: organizationId }],
			});
			if (!org) {
				return null;
			}
			const [invitations, members, teams] = await Promise.all([
				adapter.findMany<InferInvitation<O>>({
					model: "invitation",
					where: [{ field: "organizationId", value: org.id }],
				}),
				adapter.findMany<InferMember<O>>({
					model: "member",
					where: [{ field: "organizationId", value: org.id }],
					limit: membersLimit ?? options?.membershipLimit ?? 100,
				}),
				includeTeams
					? adapter.findMany<InferTeam<O>>({
							model: "team",
							where: [{ field: "organizationId", value: org.id }],
						})
					: null,
			]);

			if (!org) return null;

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
			const members = await adapter.findMany<InferMember<O>>({
				model: "member",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			if (!members || members.length === 0) {
				return [];
			}

			const organizationIds = members.map((member) => member.organizationId);

			const organizations = await adapter.findMany<InferOrganization<O>>({
				model: "organization",
				where: [
					{
						field: "id",
						value: organizationIds,
						operator: "in",
					},
				],
			});
			return organizations;
		},
		createTeam: async (data: Omit<TeamInput, "id">) => {
			const team = await adapter.create<Omit<TeamInput, "id">, InferTeam<O>>({
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
			organizationId?: string;
			includeTeamMembers?: IncludeMembers;
		}): Promise<
			| (InferTeam<O> &
					(IncludeMembers extends true ? { members: TeamMember[] } : {}))
			| null
		> => {
			const team = await adapter.findOne<InferTeam<O>>({
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
			});
			if (!team) {
				return null;
			}

			let members: TeamMember[] = [];
			if (includeTeamMembers) {
				members = await adapter.findMany<TeamMember>({
					model: "teamMember",
					where: [
						{
							field: "teamId",
							value: teamId,
						},
					],
					limit: options?.membershipLimit || 100,
				});
				return {
					...team,
					members,
				};
			}

			return team as InferTeam<O> &
				(IncludeMembers extends true ? { members: TeamMember[] } : {});
		},
		updateTeam: async (
			teamId: string,
			data: { name?: string; description?: string; status?: string },
		) => {
			if ("id" in data) data.id = undefined;
			const team = await adapter.update<
				Team & InferAdditionalFieldsFromPluginOptions<"team", O>
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
			await adapter.deleteMany({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: teamId,
					},
				],
			});
			const team = await adapter.delete<Team>({
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
			const teams = await adapter.findMany<Team>({
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
			expiresIn?: number;
		}) => {
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

		setActiveTeam: async (sessionToken: string, teamId: string | null) => {
			const session = await context.internalAdapter.updateSession(
				sessionToken,
				{
					activeTeamId: teamId,
				},
			);
			return session as Session;
		},

		listTeamMembers: async (data: { teamId: string }) => {
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
			const count = await adapter.count({
				model: "teamMember",
				where: [{ field: "teamId", value: data.teamId }],
			});
			return count;
		},
		countMembers: async (data: { organizationId: string }) => {
			const count = await adapter.count({
				model: "member",
				where: [{ field: "organizationId", value: data.organizationId }],
			});
			return count;
		},
		listTeamsByUser: async (data: { userId: string }) => {
			const members = await adapter.findMany<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "userId",
						value: data.userId,
					},
				],
			});

			const teams = await adapter.findMany<Team>({
				model: "team",
				where: [
					{
						field: "id",
						operator: "in",
						value: members.map((m) => m.teamId),
					},
				],
			});

			return teams;
		},

		findTeamMember: async (data: { teamId: string; userId: string }) => {
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
			await adapter.delete({
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
			const invitations = await adapter.findMany<InferInvitation<O>>({
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
			const invitations = await adapter.findMany<InferInvitation<O>>({
				model: "invitation",
				where: [{ field: "email", value: email.toLowerCase() }],
			});
			return invitations;
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
			const defaultExpiration = 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
				"sec",
			);
			const invite = await adapter.create<
				Omit<InvitationInput, "id">,
				InferInvitation<O>
			>({
				model: "invitation",
				data: {
					status: "pending",
					expiresAt,
					inviterId: user.id,
					...invitation,
					teamId:
						invitation.teamIds.length > 0 ? invitation.teamIds.join(",") : null,
				},
			});

			return invite;
		},
		findInvitationById: async (id: string) => {
			const invitation = await adapter.findOne<InferInvitation<O>>({
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
			const invitation = await adapter.findMany<InferInvitation<O>>({
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
			const invitations = await adapter.findMany<InferInvitation<O>>({
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
			const invitations = await adapter.findMany<InferInvitation<O>>({
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
			const invitation = await adapter.update<InferInvitation<O>>({
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
