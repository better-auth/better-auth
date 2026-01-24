import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { User } from "@better-auth/core/db";
import { APIError, BetterAuthError } from "@better-auth/core/error";
import { parseJSON } from "../../../client/parser";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db/field";
import { getDate } from "../../../utils/date";
import type {
	InvitationInput,
	Member,
	MemberInput,
	OrganizationInput,
} from "../schema";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	OrganizationOptions,
} from "../types";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { filterOutputFields } from "./filter-output-fields";
import { resolveOrgOptions } from "./resolve-org-options";

/**
 * This branded ID exists as a measure to prevent accidentally providing an un-checked organizationId that could be a slug
 * when it should be a real organization id value.
 */
export type RealOrganizationId = string & { __realOrganizationId: true };

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
		findMemberByEmail: async (data: {
			email: string;
			organizationId: RealOrganizationId;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
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
			const member = await adapter.findOne<InferMember<O, false>>({
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
		/**
		 * Lists organizations for a user with optional pagination.
		 * @param userId - The user id to list organizations for.
		 * @param opts - Optional pagination options (limit, offset).
		 * @returns The organizations and total count.
		 */
		listOrganizations: async (
			userId: string,
			opts?: {
				limit?: number;
				offset?: number;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const { limit, offset } = opts || {};

			// First, get member records for this user
			const members = await adapter.findMany<{ organizationId: string }>({
				model: "member",
				where: [{ field: "userId", value: userId }],
			});

			const orgIds = members.map((m) => m.organizationId);

			if (orgIds.length === 0) {
				return {
					organizations: [] as InferOrganization<O, false>[],
					total: 0,
				};
			}

			// Get total count
			const total = orgIds.length;

			// Apply pagination to org ids if needed
			let paginatedOrgIds = orgIds;
			if (offset !== undefined) {
				paginatedOrgIds = paginatedOrgIds.slice(offset);
			}
			if (limit !== undefined) {
				paginatedOrgIds = paginatedOrgIds.slice(0, limit);
			}

			if (paginatedOrgIds.length === 0) {
				return {
					organizations: [] as InferOrganization<O, false>[],
					total,
				};
			}

			// Fetch organizations by ids
			const organizations = await adapter.findMany<InferOrganization<O, false>>(
				{
					model: "organization",
					where: [{ field: "id", value: paginatedOrgIds, operator: "in" }],
				},
			);

			// Parse metadata for each organization
			const result = organizations.map((org) => {
				const metadata = (() => {
					const meta = org.metadata;
					if (meta && typeof meta === "string") {
						return parseJSON<Record<string, any>>(meta);
					}
					return meta;
				})();
				return filterOrgOutput({
					...org,
					metadata,
				});
			});

			return {
				organizations: result,
				total,
			};
		},
		/**
		 *
		 * @param organizationIdOrSlug - The organization id or slug to get the real organization id for.
		 * @returns The real organization id.
		 */
		getRealOrganizationId: async (
			organizationIdOrSlug: string,
		): Promise<RealOrganizationId> => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const field = options.defaultOrganizationIdField;
			if (field === "id") return organizationIdOrSlug as RealOrganizationId;
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
			return organization.id as RealOrganizationId;
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
			organizationId: RealOrganizationId;
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
		deleteOrganization: async (organizationId: RealOrganizationId) => {
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
			organizationId: RealOrganizationId;
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
			organizationId: RealOrganizationId;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne({
				model: "member",
				where: [
					{ field: "userId", value: userId },
					{ field: "organizationId", value: organizationId },
				],
				select: ["id"],
			});
			return member ? true : false;
		},
		findPendingInvitation: async (data: {
			email: string;
			organizationId: RealOrganizationId;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitation = await adapter.findMany<InferInvitation<O, false>>({
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
					// Note: This is recently added as part of org-rewrite.
					// It will filter out expired invitations.
					// If the causes issues down the line (unlikely), we can remove this - there is still JS based filtering below.
					{
						field: "expiresAt",
						value: new Date(),
						operator: "gt",
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
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitation = await adapter.update<InferInvitation<O, false>>({
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
		findPendingInvitations: async (data: {
			organizationId: RealOrganizationId;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
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
					// Note: This is recently added as part of org-rewrite.
					// It will filter out expired invitations.
					// If the causes issues down the line (unlikely), we can remove this - there is still JS based filtering below.
					{
						field: "expiresAt",
						value: new Date(),
						operator: "gt",
					},
				],
			});
			return invitations.filter(
				(invite) => new Date(invite.expiresAt) > new Date(),
			);
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
			const adapter = await getCurrentAdapter(baseAdapter);
			const expiresAt = getDate(options.invitationExpiresIn, "sec");
			const teamId = invitation.teamIds.join(",") ?? null;
			const invite = await adapter.create<
				Omit<InvitationInput, "id">,
				InferInvitation<O, false>
			>({
				model: "invitation",
				data: {
					status: "pending",
					expiresAt,
					createdAt: new Date(),
					inviterId: user.id,
					...invitation,
					teamId,
				},
			});

			return invite;
		},
		countMembers: async (data: { organizationId: RealOrganizationId }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "member",
				where: [{ field: "organizationId", value: data.organizationId }],
			});
			return count;
		},
		findInvitationById: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitation = await adapter.findOne<InferInvitation<O, false>>({
				model: "invitation",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
			if (!invitation) return null;
			return {
				...invitation,
				organizationId: invitation.organizationId as RealOrganizationId,
			};
		},
	};
	return orgAdapter;
};
