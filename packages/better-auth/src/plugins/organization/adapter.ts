import { User } from "../../adapters/schema";
import { Adapter } from "../../types/adapter";
import { generateId } from "../../utils/id";
import { OrganizationOptions } from "./organization";
import { Member, Organization } from "./schema";

export const getOrgAdapter = (
	adapter: Adapter,
	options?: OrganizationOptions,
) => {
	return {
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
	};
};
