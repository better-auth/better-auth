import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { Session } from "@better-auth/core/db";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db/field";
import type { Member, MemberInput, OrganizationInput } from "../schema";
import type {
	InferMember,
	InferOrganization,
	OrganizationOptions,
} from "../types";
import { resolveOrgOptions } from "./resolve-org-options";

export const getOrgAdapter = <O extends OrganizationOptions>(
	context: AuthContext,
	opts?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	const options = resolveOrgOptions(opts);
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
			return organization ? true : false;
		},
		/**
		 * Checks if an organization id is valid.
		 * @param organizationId - The organization id to check, supports both `id` and `slug` id types.
		 * @returns true if the organization id is valid, false otherwise.
		 */
		isOrganizationIdValid: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const field = options.defaultOrganizationIdField;
			const value = organizationId;

			const organization = await adapter.findOne({
				model: "organization",
				where: [{ field, value }],
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
			type Result = InferOrganization<O, false>;
			const organization = await adapter.create<typeof data, Result>({
				model: "organization",
				data: {
					...data,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
				},
				forceAllowId: true,
			});

			const metadata = (() => {
				const m = organization.metadata;
				if (m && typeof m === "string") {
					return JSON.parse(m);
				}
				return m;
			})();

			return {
				...organization,
				metadata,
			} as Result;
		},
		createMember: async (
			data: Omit<MemberInput, "id"> & Record<string, any>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			type MemberAF = InferAdditionalFieldsFromPluginOptions<
				"member",
				O,
				false
			>;
			const update = { ...data, createdAt: new Date() };
			const member = await adapter.create<typeof data, Member & MemberAF>({
				model: "member",
				data: update,
			});
			return member;
		},
		setActiveOrganization: async (
			sessionToken: string,
			organizationId: string | null,
		) => {
			const internalAdapter = context.internalAdapter;
			const update = { activeOrganizationId: organizationId };
			const session = await internalAdapter.updateSession(sessionToken, update);
			return session as Session;
		},
		findMemberByOrgId: async (data: {
			userId: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne<InferMember<O, false>>({
				model: "member",
				where: [
					{ field: "userId", value: data.userId },
					{ field: "organizationId", value: data.organizationId },
				],
			});
			return member;
		},
		findOrganizationById: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const field = options.defaultOrganizationIdField;
			const value = organizationId;
			const organization = await adapter.findOne<InferOrganization<O, false>>({
				model: "organization",
				where: [{ field, value }],
			});
			return organization;
		},
	};
};
