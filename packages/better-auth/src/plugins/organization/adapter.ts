import type { Session, User } from "../../types";
import { getDate } from "../../utils/date";
import type { OrganizationOptions } from "./types";
import type {
	Invitation,
	InvitationInput,
	Member,
	MemberInput,
	Organization,
	OrganizationInput,
	Team,
	TeamInput,
} from "./schema";
import { BetterAuthError } from "../../error";
import type { AuthContext } from "../../init";
import parseJSON from "../../client/parser";

export const getOrgAdapter = (
	context: AuthContext,
	options?: OrganizationOptions,
) => {
	const adapter = context.adapter;
	return {
		findOrganizationBySlug: async (slug: string) => {
			const organization = await adapter.findOne<Organization>({
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
			organization: OrganizationInput;
		}) => {
			const organization = await adapter.create<
				OrganizationInput,
				Organization
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
				metadata: organization.metadata
					? JSON.parse(organization.metadata)
					: undefined,
			};
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
						value: data.email,
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
			organizationId: string;
		}) => {
			const members = await adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: data.organizationId,
					},
				],
				limit: options?.membershipLimit || 100,
			});
			return members;
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
		createMember: async (data: Omit<MemberInput, "id">) => {
			const member = await adapter.create<Omit<MemberInput, "id">, Member>({
				model: "member",
				data: {
					...data,
					createdAt: new Date(),
				},
			});
			return member;
		},
		updateMember: async (memberId: string, role: string) => {
			const member = await adapter.update<Member>({
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
			const member = await adapter.delete<Member>({
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
			data: Partial<Organization>,
		) => {
			const organization = await adapter.update<Organization>({
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
			await adapter.delete<Organization>({
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
			const organization = await adapter.findOne<Organization>({
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
		/**
		 * @requires db
		 */
		findFullOrganization: async ({
			organizationId,
			isSlug,
			includeTeams,
		}: {
			organizationId: string;
			isSlug?: boolean;
			includeTeams?: boolean;
		}) => {
			const org = await adapter.findOne<Organization>({
				model: "organization",
				where: [{ field: isSlug ? "slug" : "id", value: organizationId }],
			});
			if (!org) {
				return null;
			}
			const [invitations, members, teams] = await Promise.all([
				adapter.findMany<Invitation>({
					model: "invitation",
					where: [{ field: "organizationId", value: org.id }],
				}),
				adapter.findMany<Member>({
					model: "member",
					where: [{ field: "organizationId", value: org.id }],
					limit: options?.membershipLimit || 100,
				}),
				includeTeams
					? adapter.findMany<Team>({
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
			const members = await adapter.findMany<Member>({
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

			const organizations = await adapter.findMany<Organization>({
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
			const team = await adapter.create<Omit<TeamInput, "id">, Team>({
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
			(Team & (IncludeMembers extends true ? { members: Member[] } : {})) | null
		> => {
			const team = await adapter.findOne<Team>({
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
			let members: Member[] = [];
			if (includeTeamMembers) {
				members = await adapter.findMany<Member>({
					model: "member",
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
			return team as Team &
				(IncludeMembers extends true ? { members: Member[] } : {});
		},
		updateTeam: async (
			teamId: string,
			data: { name?: string; description?: string; status?: string },
		) => {
			const team = await adapter.update<Team>({
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

			const invitation = await adapter.create<InvitationInput, Invitation>({
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
		findInvitationsByTeamId: async (teamId: string) => {
			const invitations = await adapter.findMany<Invitation>({
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

		createInvitation: async ({
			invitation,
			user,
		}: {
			invitation: {
				email: string;
				role: string;
				organizationId: string;
				teamId?: string;
			};
			user: User;
		}) => {
			const defaultExpiration = 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
				"sec",
			);
			const invite = await adapter.create<
				Omit<InvitationInput, "id">,
				Invitation
			>({
				model: "invitation",
				data: {
					status: "pending",
					expiresAt,
					inviterId: user.id,
					...invitation,
				},
			});

			return invite;
		},
		findInvitationById: async (id: string) => {
			const invitation = await adapter.findOne<Invitation>({
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
			const invitation = await adapter.findMany<Invitation>({
				model: "invitation",
				where: [
					{
						field: "email",
						value: data.email,
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
		findPendingInvitations: async (data: {
			organizationId: string;
		}) => {
			const invitations = await adapter.findMany<Invitation>({
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
		listInvitations: async (data: {
			organizationId: string;
		}) => {
			const invitations = await adapter.findMany<Invitation>({
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
			const invitation = await adapter.update<Invitation>({
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
