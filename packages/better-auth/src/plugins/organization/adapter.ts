import { Session, User } from "../../adapters/schema";
import { Adapter } from "../../types/adapter";
import { generateId } from "../../utils/id";
import { OrganizationOptions } from "./organization";
import { Invitation, Member, Organization } from "./schema";

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
					role: options?.creatorRole || "admin",
				},
			});
			return {
				...organization,
				members: [member],
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
			return organization;
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
		findFullOrganization: async (orgId: string) => {
			const organization = await adapter.findOne<Organization>({
				model: "organization",
				where: [
					{
						field: "id",
						value: orgId,
					},
				],
			});
			if (!organization) {
				return null;
			}
			const members = await adapter.findMany<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: orgId,
					},
				],
			});
			const invitations = await adapter.findMany<Invitation>({
				model: "invitation",
				where: [
					{
						field: "organizationId",
						value: orgId,
					},
				],
			});
			return {
				...organization,
				members,
				invitations,
			};
		},
	};
};
