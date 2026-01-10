import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { OrganizationOptions } from "../types";

export const getOrgAdapter = <O extends OrganizationOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	return {
		isSlugTaken: async (slug: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.findOne({
				model: "organization",
				where: [{ field: "slug", value: slug }],
				select: ["id"],
			});
			return organization !== null;
		},
		countOrganizations: async (userId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "organization",
				where: [{ field: "userId", value: userId }],
			});
			return count;
		},
		// createOrganization: async (data: {
		// 	organization: OrganizationInput & Record<string, any>;
		// }) => {
		// 	const adapter = await getCurrentAdapter(baseAdapter);
		// 	const organization = await adapter.create<
		// 		OrganizationInput,
		// 		InferOrganization<O, false>
		// 	>({
		// 		model: "organization",
		// 		data: {
		// 			...data.organization,
		// 			metadata: data.organization.metadata
		// 				? JSON.stringify(data.organization.metadata)
		// 				: undefined,
		// 		},
		// 		forceAllowId: true,
		// 	});

		// 	return {
		// 		...organization,
		// 		metadata:
		// 			organization.metadata && typeof organization.metadata === "string"
		// 				? JSON.parse(organization.metadata)
		// 				: undefined,
		// 	} as typeof organization;
		// },
	};
};
