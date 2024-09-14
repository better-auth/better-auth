import type { Kysely } from "kysely";
import type { Session, User } from "../../adapters/schema";
import type { Adapter } from "../../types/adapter";
import { getDate } from "../../utils/date";
import { generateId } from "../../utils/id";
import type { OrganizationOptions } from "./organization";
import type { Invitation, Member, Organization } from "./schema";

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
				data: data.organization,
			});
			const member = await adapter.create<Member>({
				model: "member",
				data: {
					id: generateId(),
					organizationId: organization.id,
					userId: data.user.id,
					email: data.user.email,
					role: options?.creatorRole || "owner",
				},
			});
			return {
				...organization,
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
			const organization = await adapter.delete<Organization>({
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
		 *
		 * @requires db
		 */
		findFullOrganization: async (orgId: string, db: Kysely<any>) => {
			const rows = await db
				?.selectFrom("organization")
				.leftJoin("member", "organization.id", "member.organizationId")
				.leftJoin("invitation", "organization.id", "invitation.organizationId")
				.leftJoin("user", "member.userId", "user.id")
				.where("organization.id", "=", orgId)
				.select([
					"organization.id as org_id",
					"organization.name as org_name",
					"organization.slug as org_slug",
					"member.id as member_id",
					"member.userId as member_user_id",
					"member.role as member_role",
					"invitation.id as invitation_id",
					"invitation.email as invitation_email",
					"invitation.status as invitation_status",
					"invitation.expiresAt as invitation_expiresAt",
					"invitation.role as invitation_role",
					"invitation.inviterId as invitation_inviterId",
					"user.id as user_id",
					"user.name as user_name",
					"user.email as user_email",
					"user.image as user_image",
				])
				.execute();
			if (!rows || rows.length === 0) {
				return null;
			}
			const organization: Organization & {
				members: (Member & {
					user: { id: string; name: string; email: string; image: string };
				})[];
				invitations: Invitation[];
			} = {
				id: rows[0].org_id,
				name: rows[0].org_name,
				slug: rows[0].org_slug,
				members: [],
				invitations: [],
			};
			// biome-ignore lint/complexity/noForEach: <explanation>
			rows.forEach((row) => {
				if (row.member_id) {
					const existingMember = organization.members.find(
						(m) => m.id === row.member_id,
					);
					if (!existingMember) {
						organization.members.push({
							id: row.member_id,
							userId: row.member_user_id,
							role: row.member_role,
							// Add other member fields
							user: {
								id: row.user_id,
								name: row.user_name,
								email: row.user_email,
								image: row.user_image,
							},
							email: row.user_email,
							organizationId: row.org_id,
						});
					}
				}
				if (row.invitation_id) {
					organization.invitations.push({
						id: row.invitation_id,
						email: row.invitation_email,
						status: row.invitation_status,
						expiresAt: row.invitation_expiresAt,
						organizationId: row.org_id,
						role: row.invitation_role,
						inviterId: row.invitation_inviterId,
					});
				}
			});
			return organization;
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
