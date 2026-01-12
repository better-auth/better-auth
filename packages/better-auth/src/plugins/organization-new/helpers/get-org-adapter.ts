import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { Session } from "@better-auth/core/db";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db/field";
import type { Member, MemberInput, OrganizationInput } from "../schema";
import type { InferOrganization, ResolvedOrganizationOptions } from "../types";

export const getOrgAdapter = <O extends ResolvedOrganizationOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	return {
		/**
		 * This function exists as a more optimized way to check if a slug is already taken.
		 * The primary difference lies in the `select` parameter which only grabs `id` to reduce payload size & improve query performance.
		 *
		 * @returns true if the slug is taken, false otherwise
		 */
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
				model: "member",
				where: [{ field: "userId", value: userId }],
			});
			return count;
		},
		createOrganization: async (
			data: OrganizationInput & Record<string, any>,
		) => {
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
		createMember: async (
			data: Omit<MemberInput, "id"> & Record<string, any>,
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
	};
};
