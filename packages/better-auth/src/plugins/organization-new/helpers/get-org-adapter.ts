import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { User } from "@better-auth/core/db";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { parseJSON } from "../../../client/parser";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db/field";
import type { Member, MemberInput, OrganizationInput } from "../schema";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	OrganizationOptions,
} from "../types";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { filterOutputFields } from "./filter-output-fields";
import { resolveOrgOptions } from "./resolve-org-options";

export const getOrgAdapter = <O extends OrganizationOptions>(
	context: AuthContext,
	opts?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	const options = resolveOrgOptions(opts);
	const schema = options.schema || {};

	const filterOrgOutput = <Org extends Record<string, any> | null>(
		organization: Org,
	) => {
		const orgAdditionalFields = schema.organization?.additionalFields;
		const result = filterOutputFields(organization, orgAdditionalFields);
		return result;
	};

	const filterMemberOutput = <Member extends Record<string, any> | null>(
		member: Member,
	) => {
		const memberAdditionalFields = schema.member?.additionalFields;
		const result = filterOutputFields(member, memberAdditionalFields);
		return result;
	};

	const filterInvitationOutput = <
		Invitation extends Record<string, any> | null,
	>(
		invitation: Invitation,
	) => {
		const invitationAdditionalFields = schema.invitation?.additionalFields;
		const result = filterOutputFields(invitation, invitationAdditionalFields);
		return result;
	};

	const filterSessionOutput = <Session extends Record<string, any> | null>(
		session: Session,
	) => {
		const sessionAdditionalFields = context.options.session?.additionalFields;
		const result = filterOutputFields(session, sessionAdditionalFields);
		return result;
	};

	const orgAdapter = {
		/**
		 *
		 * @param organizationIdOrSlug - The organization id or slug to get the real organization id for.
		 * @returns The real organization id.
		 */
		getRealOrganizationId: async (organizationIdOrSlug: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const field = options.defaultOrganizationIdField;
			if (field === "id") return organizationIdOrSlug;
			const value = organizationIdOrSlug;
			const organization = await adapter.findOne<{ id: string }>({
				model: "organization",
				where: [{ field, value }],
				select: ["id"],
			});
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			return organization.id;
		},
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
			const organization = await adapter.create<
				typeof data,
				InferOrganization<O, false>
			>({
				model: "organization",
				data: {
					...data,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
				},
				forceAllowId: true,
			});

			const metadata = (() => {
				const meta = organization.metadata;
				if (meta && typeof meta === "string") {
					return parseJSON<Record<string, any>>(meta);
				}
				return meta;
			})();

			const res: InferOrganization<O, false> = {
				...organization,
				metadata,
			};

			return filterOrgOutput(res);
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
			return filterMemberOutput(member);
		},
		setActiveOrganization: async (
			sessionToken: string,
			organizationId: string | null,
		) => {
			const internalAdapter = context.internalAdapter;
			const update = { activeOrganizationId: organizationId };
			const session = await internalAdapter.updateSession(sessionToken, update);
			return filterSessionOutput(session);
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
			return filterMemberOutput(member);
		},
		findOrganizationById: async (organizationId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const field = options.defaultOrganizationIdField;
			const value = organizationId;
			const organization = await adapter.findOne<InferOrganization<O, false>>({
				model: "organization",
				where: [{ field, value }],
			});
			if (!organization) return null;
			const metadata = (() => {
				const meta = organization.metadata;
				if (meta && typeof meta === "string") {
					return parseJSON<Record<string, any>>(meta);
				}
				return meta;
			})();
			const res: InferOrganization<O, false> = {
				...organization,
				metadata,
			};
			return filterOrgOutput(res);
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

			if (!organization) return null;

			const metadata = (() => {
				const meta = organization.metadata;
				if (meta && typeof meta === "string") {
					return parseJSON<Record<string, any>>(meta);
				}
				return meta;
			})();

			const res: InferOrganization<O, false> = {
				...organization,
				metadata,
			};

			return filterOrgOutput(res);
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
		/**
		 * @requires db
		 */
		findFullOrganization: async ({
			organizationId,
			membersLimit,
		}: {
			organizationId: string;
			membersLimit?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const isSlug = options.defaultOrganizationIdField === "slug";
			const result = await adapter.findOne<
				InferOrganization<O, false> & {
					invitation: InferInvitation<O, false>[];
					member: InferMember<O, false>[];
				}
			>({
				model: "organization",
				where: [{ field: isSlug ? "slug" : "id", value: organizationId }],
				join: {
					invitation: true,
					member: membersLimit ? { limit: membersLimit } : true,
				},
			});
			if (!result) {
				return null;
			}

			const { invitation: invitations, member: members, ...org } = result;
			const userIds = members.map((member) => member.userId);
			const users =
				userIds.length > 0
					? await adapter.findMany<User>({
							model: "user",
							where: [{ field: "id", value: userIds, operator: "in" }],
							limit:
								(typeof options?.membershipLimit === "number"
									? options.membershipLimit
									: 100) || 100,
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
				...filterOrgOutput(org),
				invitations: invitations.map(filterInvitationOutput),
				members: membersWithUsers.map(filterMemberOutput),
			};
		},
		getMember: async ({
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
			return filterMemberOutput(member);
		},
		checkMembership: async ({
			userId,
			organizationId,
		}: {
			userId: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const realOrgId = await orgAdapter.getRealOrganizationId(organizationId);
			const member = await adapter.findOne({
				model: "member",
				where: [
					{ field: "userId", value: userId },
					{ field: "organizationId", value: realOrgId },
				],
				select: ["id"],
			});
			return member ? true : false;
		},
	};
	return orgAdapter;
};
