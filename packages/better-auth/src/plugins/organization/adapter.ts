import type { Kysely } from "kysely";
import type { Session, User } from "../../db/schema";
import type { Adapter } from "../../types/adapter";
import { getDate } from "../../utils/date";
import { generateId } from "../../utils/id";
import type { OrganizationOptions } from "./organization";
import type { Invitation, Member, Organization } from "./schema";
import { BetterAuthError } from "../../error/better-auth-error";

export const getOrgAdapter = (
	adapter: Adapter,
	options?: OrganizationOptions,
) => {
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
			organization: Organization;
			user: User;
		}) => {
			const organization = await adapter.create<Organization>({
				model: "organization",
				data: {
					...data.organization,
					metadata: data.organization.metadata
						? JSON.stringify(data.organization.metadata)
						: undefined,
				},
			});
			const member = await adapter.create<Member>({
				model: "member",
				data: {
					id: generateId(),
					organizationId: organization.id,
					userId: data.user.id,
					createdAt: new Date(),
					email: data.user.email,
					role: options?.creatorRole || "owner",
				},
			});
			return {
				...organization,
				metadata: organization.metadata
					? JSON.parse(organization.metadata)
					: undefined,
				members: [
					{
						...member,
						user: {
							id: data.user.id,
							name: data.user.name,
							email: data.user.email,
							image: data.user.image,
						},
					},
				],
			};
		},
		findMemberByEmail: async (data: {
			email: string;
			organizationId: string;
		}) => {
			const member = await adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "email",
						value: data.email,
					},
					{
						field: "organizationId",
						value: data.organizationId,
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
		findMemberByOrgId: async (data: {
			userId: string;
			organizationId: string;
		}) => {
			const member = await adapter.findOne<Member>({
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
		createMember: async (data: Member) => {
			const member = await adapter.create<Member>({
				model: "member",
				data: data,
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
		updateOrganization: async (orgId: string, data: Partial<Organization>) => {
			const organization = await adapter.update<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: orgId,
					},
				],
				update: data,
			});
			return organization;
		},
		deleteOrganization: async (orgId: string) => {
			await adapter.delete({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: orgId,
					},
				],
			});
			await adapter.delete({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: orgId,
					},
				],
			});
			await adapter.delete<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: orgId,
					},
				],
			});
			return orgId;
		},
		setActiveOrganization: async (sessionId: string, orgId: string | null) => {
			const session = await adapter.update<Session>({
				model: "session",
				where: [
					{
						field: "id",
						value: sessionId,
					},
				],
				update: {
					activeOrganizationId: orgId,
				},
			});
			return session;
		},
		findOrganizationById: async (orgId: string) => {
			const organization = await adapter.findOne<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: orgId,
					},
				],
			});
			return organization;
		},
		/**
		 * @requires db
		 */
		findFullOrganization: async (orgId: string, db?: Kysely<any>) => {
			const org = await adapter.findOne<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: orgId,
					},
				],
			});
			if (!org) {
				return null;
			}

			const invitations = await adapter.findMany<Invitation>({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: orgId,
					},
				],
			});

			const members = await adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: orgId,
					},
				],
			});

			const membersWithUsers = await Promise.all(
				members.map(async (member) => {
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
			);
			const fullOrg = {
				...org,
				invitations,
				members: membersWithUsers,
			};
			return fullOrg;
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
			const organizationIds = members?.map((member) => member.organizationId);
			if (!organizationIds) {
				return [];
			}
			const organizations: Organization[] = [];
			for (const id of organizationIds) {
				const organization = await adapter.findOne<Organization>({
					model: "organization",
					where: [
						{
							field: "id",
							value: id,
						},
					],
				});
				if (organization) {
					organizations.push(organization);
				}
			}
			return organizations;
		},
		createInvitation: async ({
			invitation,
			user,
		}: {
			invitation: {
				email: string;
				role: "admin" | "member" | "owner";
				organizationId: string;
			};
			user: User;
		}) => {
			const defaultExpiration = 1000 * 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
			);
			const invite = await adapter.create<Invitation>({
				model: "invitation",
				data: {
					id: generateId(),
					email: invitation.email,
					role: invitation.role,
					organizationId: invitation.organizationId,
					status: "pending",
					expiresAt,
					inviterId: user.id,
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
