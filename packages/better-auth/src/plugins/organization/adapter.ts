import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { BetterAuthError } from "@better-auth/core/error";
import parseJSON from "../../client/parser";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type { Session, User } from "../../types";
import { getDate } from "../../utils/date";
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	InferOrganizationRole,
	InferTeam,
	InferTeamRole,
	InvitationInput,
	Member,
	MemberInput,
	MemberOrganizationRole,
	MemberTeamRole,
	OrganizationInput,
	OrganizationRole,
	Team,
	TeamInput,
	TeamMember,
	TeamRole,
} from "./schema";
import type { OrganizationOptions } from "./types";
import { APIError } from "better-call";

export const getOrgAdapter = <O extends OrganizationOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	const orgAdapter = {
		findOrganizationBySlug: async (slug: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.findOne<InferOrganization<O, false>>({
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
			organization: OrganizationInput &
				// This represents the additional fields from the plugin options
				Record<string, any>;
		}) => {
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
		findMemberByEmail: async (data: {
			email: string;
			organizationId: string;
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
		listMembers: async (data: {
			organizationId?: string | undefined;
			limit?: number | undefined;
			offset?: number | undefined;
			sortBy?: string | undefined;
			sortOrder?: ("asc" | "desc") | undefined;
			filter?:
				| {
						field: string;
						operator?: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains";
						value: any;
				  }
				| undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const [members, total, roleAssignments] = await Promise.all([
				adapter.findMany<InferMember<O, false>>({
					model: "member",
					where: [
						{ field: "organizationId", value: data.organizationId },
						...(data.filter?.field
							? [
									{
										field: data.filter?.field,
										value: data.filter?.value,
									},
								]
							: []),
					],
					limit: data.limit || options?.membershipLimit || 100,
					offset: data.offset || 0,
					sortBy: data.sortBy
						? { field: data.sortBy, direction: data.sortOrder || "asc" }
						: undefined,
				}),
				adapter.count({
					model: "member",
					where: [
						{ field: "organizationId", value: data.organizationId },
						...(data.filter?.field
							? [
									{
										field: data.filter?.field,
										value: data.filter?.value,
									},
								]
							: []),
					],
				}),
				// Get all role assignments for this organization
				data.organizationId
					? adapter.findMany<MemberOrganizationRole>({
							model: "memberOrganizationRole",
							where: [{ field: "organizationId", value: data.organizationId }],
						})
					: Promise.resolve([]),
			]);
			const users = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: members.map((member) => member.userId),
						operator: "in",
					},
				],
			});
			// Create a map of memberId -> roles
			const rolesMap = new Map<string, string[]>();
			roleAssignments.forEach((ra) => {
				const existing = rolesMap.get(ra.memberId) || [];
				existing.push(ra.role);
				rolesMap.set(ra.memberId, existing);
			});
			return {
				members: members.map((member) => {
					const user = users.find((user) => user.id === member.userId);
					if (!user) {
						throw new BetterAuthError(
							"Unexpected error: User not found for member",
						);
					}
					return {
						...member,
						organizationRoles: rolesMap.get(member.id) || [],
						user: {
							id: user.id,
							name: user.name,
							email: user.email,
							image: user.image,
						},
					};
				}),
				total,
			};
		},
		findMemberByOrgId: async (data: {
			userId: string;
			organizationId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const [{ user, ...member }, roleAssignments] = await Promise.all([
				adapter.findOne<InferMember<O, false> & { user: User }>({
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
					join: {
						user: true,
					},
				}),
				// Get role types from junction table
				adapter.findMany<MemberOrganizationRole>({
					model: "memberOrganizationRole",
					where: [
						{
							field: "organizationId",
							value: data.organizationId,
						},
					],
				}),
			]);
			if (!user || !member) {
				return null;
			}
			// Filter roles for this specific member
			const memberRoles = roleAssignments
				.filter((ra) => ra.memberId === member.id)
				.map((ra) => ra.role);
			return {
				...member,
				organizationRoles: memberRoles,
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		findMemberById: async (memberId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const [{ user, ...member }, roleAssignments] = await Promise.all([
				adapter.findOne<InferMember<O, false> & { user: User }>({
					model: "member",
					where: [
						{
							field: "id",
							value: memberId,
						},
					],
					join: {
						user: true,
					},
				}),
				adapter.findMany<MemberOrganizationRole>({
					model: "memberOrganizationRole",
					where: [{ field: "memberId", value: memberId }],
				}),
			]);

			if (!member) {
				return null;
			}
			if (!user) {
				return null;
			}
			return {
				...(member as unknown as InferMember<O, false>),
				organizationRoles: roleAssignments.map((ra) => ra.role),
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
				},
			};
		},
		createMember: async (
			data: Omit<MemberInput, "id"> &
				// Additional fields from the plugin options
				Record<string, any>,
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

			await orgAdapter.assignOrganizationRolesToMember(
				member.id,
				data.organizationId,
				data.organizationRoles ?? ["owner"],
			);
			return member;
		},
		// Organization Role Management
		createOrganizationRole: async (data: {
			organizationId: string;
			type: string;
			name: string;
			description?: string;
			isBuiltIn?: boolean;
			permissions?: Record<string, unknown>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Check if role type already exists for this organization
			const existing = await adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [
					{ field: "organizationId", value: data.organizationId },
					{ field: "type", value: data.type },
				],
			});
			if (existing) {
				throw new BetterAuthError(
					`Role type '${data.type}' already exists for this organization`,
				);
			}
			const role = await adapter.create<
				typeof data,
				InferOrganizationRole<O, false>
			>({
				model: "organizationRole",
				data: {
					...data,
					isBuiltIn: data.isBuiltIn ?? false,
				},
				forceAllowId: true,
			});
			return role;
		},
		updateOrganizationRole: async (
			roleId: string,
			data: {
				name?: string;
				description?: string;
				permissions?: Record<string, unknown>;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
			});
			if (!role) {
				throw new BetterAuthError("Role not found");
			}
			if (role.isBuiltIn) {
				throw new BetterAuthError("Cannot update built-in roles");
			}
			const updated = await adapter.update<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
				update: {
					...data,
					updatedAt: new Date(),
				},
			});
			return updated;
		},
		deleteOrganizationRole: async (roleId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
			});
			if (!role) {
				throw new BetterAuthError("Role not found");
			}
			if (role.isBuiltIn) {
				throw new BetterAuthError("Cannot delete built-in roles");
			}
			// Check if role is in use
			const inUse = await adapter.findOne<MemberOrganizationRole>({
				model: "memberOrganizationRole",
				where: [
					{ field: "organizationId", value: role.organizationId },
					{ field: "role", value: role.type },
				],
			});
			if (inUse) {
				throw new BetterAuthError(
					"Cannot delete role that is assigned to members",
				);
			}
			await adapter.delete<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
			});
			return roleId;
		},
		listOrganizationRoles: async (data: {
			organizationId: string;
			types?: string[];
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const where: Array<{
				field: string;
				value: any;
				operator?: "in" | "eq";
			}> = [{ field: "organizationId", value: data.organizationId }];
			if (data.types && data.types.length > 0) {
				where.push({ field: "type", value: data.types, operator: "in" });
			}
			const roles = await adapter.findMany<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where,
			});
			return roles;
		},
		getOrganizationRole: async (roleId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
			});
			return role;
		},
		getOrganizationRolesByTypes: async (
			organizationId: string,
			types: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roles = await adapter.findMany<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "type", value: types, operator: "in" },
				],
			});
			return roles;
		},
		assignOrganizationRolesToMember: async (
			memberId: string,
			organizationId: string,
			roles: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Validate all role types exist
			const existingRoles = await adapter.findMany<OrganizationRole>({
				model: "organizationRole",
				where: [
					{ field: "organizationId", value: organizationId },
					{ field: "type", value: roles, operator: "in" },
				],
			});
			const existingTypes = new Set(existingRoles.map((r) => r.type));
			const missingTypes = roles.filter((r) => !existingTypes.has(r));
			if (missingTypes.length > 0) {
				throw new APIError("BAD_REQUEST", {
					message: `Role type(s) '${missingTypes.join(", ")}' do not exist for this organization`,
				});
			}
			// Remove existing roles for this member
			await adapter.deleteMany({
				model: "memberOrganizationRole",
				where: [{ field: "memberId", value: memberId }],
			});
			// Create new role assignments
			await Promise.all(
				roles.map((role) =>
					adapter.create<
						Omit<MemberOrganizationRole, "id" | "createdAt">,
						MemberOrganizationRole
					>({
						model: "memberOrganizationRole",
						data: {
							memberId,
							organizationId,
							role,
						},
					}),
				),
			);
		},
		removeOrganizationRolesFromMember: async (
			memberId: string,
			roles: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.deleteMany({
				model: "memberOrganizationRole",
				where: [
					{ field: "memberId", value: memberId },
					{ field: "role", value: roles, operator: "in" },
				],
			});
		},
		getMemberOrganizationRoles: async (memberId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roleAssignments = await adapter.findMany<MemberOrganizationRole>({
				model: "memberOrganizationRole",
				where: [{ field: "memberId", value: memberId }],
			});
			return roleAssignments.map((ra) => ra.role);
		},
		// Team Role Management
		createTeamRole: async (data: {
			teamId: string;
			type: string;
			name: string;
			description?: string;
			isBuiltIn?: boolean;
			permissions?: Record<string, unknown>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Check if role type already exists for this team
			const existing = await adapter.findOne<TeamRole>({
				model: "teamRole",
				where: [
					{ field: "teamId", value: data.teamId },
					{ field: "type", value: data.type },
				],
			});
			if (existing) {
				throw new BetterAuthError(
					`Role type '${data.type}' already exists for this team`,
				);
			}
			const role = await adapter.create<typeof data, InferTeamRole<O, false>>({
				model: "teamRole",
				data: {
					...data,
					isBuiltIn: data.isBuiltIn ?? false,
				},
			});
			return role;
		},
		updateTeamRole: async (
			roleId: string,
			data: {
				name?: string;
				description?: string;
				permissions?: Record<string, unknown>;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<TeamRole>({
				model: "teamRole",
				where: [{ field: "id", value: roleId }],
			});
			if (!role) {
				throw new BetterAuthError("Role not found");
			}
			if (role.isBuiltIn) {
				throw new BetterAuthError("Cannot update built-in roles");
			}
			const updated = await adapter.update<InferTeamRole<O, false>>({
				model: "teamRole",
				where: [{ field: "id", value: roleId }],
				update: {
					...data,
					updatedAt: new Date(),
				},
			});
			return updated;
		},
		deleteTeamRole: async (roleId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<TeamRole>({
				model: "teamRole",
				where: [{ field: "id", value: roleId }],
			});
			if (!role) {
				throw new BetterAuthError("Role not found");
			}
			if (role.isBuiltIn) {
				throw new BetterAuthError("Cannot delete built-in roles");
			}
			// Check if role is in use
			const inUse = await adapter.findOne<MemberTeamRole>({
				model: "memberTeamRole",
				where: [
					{ field: "teamId", value: role.teamId },
					{ field: "role", value: role.type },
				],
			});
			if (inUse) {
				throw new BetterAuthError(
					"Cannot delete role that is assigned to team members",
				);
			}
			await adapter.delete<InferTeamRole<O, false>>({
				model: "teamRole",
				where: [{ field: "id", value: roleId }],
			});
			return roleId;
		},
		listTeamRoles: async (data: { teamId: string; types?: string[] }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const where: Array<{
				field: string;
				value: any;
				operator?: "in" | "eq";
			}> = [{ field: "teamId", value: data.teamId }];
			if (data.types && data.types.length > 0) {
				where.push({ field: "type", value: data.types, operator: "in" });
			}
			const roles = await adapter.findMany<InferTeamRole<O, false>>({
				model: "teamRole",
				where,
			});
			return roles;
		},
		getTeamRole: async (roleId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<InferTeamRole<O, false>>({
				model: "teamRole",
				where: [{ field: "id", value: roleId }],
			});
			return role;
		},
		getTeamRolesByTypes: async (teamId: string, types: string[]) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roles = await adapter.findMany<InferTeamRole<O, false>>({
				model: "teamRole",
				where: [
					{ field: "teamId", value: teamId },
					{ field: "type", value: types, operator: "in" },
				],
			});
			return roles;
		},
		assignTeamRolesToMember: async (
			teamMemberId: string,
			teamId: string,
			roles: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Validate all role types exist
			const existingRoles = await adapter.findMany<TeamRole>({
				model: "teamRole",
				where: [
					{ field: "teamId", value: teamId },
					{ field: "type", value: roles, operator: "in" },
				],
			});
			const existingTypes = new Set(existingRoles.map((r) => r.type));
			const missingTypes = roles.filter((r) => !existingTypes.has(r));
			if (missingTypes.length > 0) {
				throw new BetterAuthError(
					`Role type(s) '${missingTypes.join(", ")}' do not exist for this team`,
				);
			}
			// Remove existing roles for this team member
			await adapter.deleteMany({
				model: "memberTeamRole",
				where: [{ field: "team_member_id", value: teamMemberId }],
			});
			// Create new role assignments
			await Promise.all(
				roles.map((role) =>
					adapter.create<
						Omit<MemberTeamRole, "id" | "createdAt">,
						MemberTeamRole
					>({
						model: "memberTeamRole",
						data: {
							team_member_id: teamMemberId,
							teamId,
							role,
						},
					}),
				),
			);
		},
		removeTeamRolesFromMember: async (
			teamMemberId: string,
			roles: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.deleteMany({
				model: "memberTeamRole",
				where: [
					{ field: "team_member_id", value: teamMemberId },
					{ field: "role", value: roles, operator: "in" },
				],
			});
		},
		getMemberTeamRoles: async (teamMemberId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roleAssignments = await adapter.findMany<MemberTeamRole>({
				model: "memberTeamRole",
				where: [{ field: "team_member_id", value: teamMemberId }],
			});
			return roleAssignments.map((ra) => ra.role);
		},
		deleteMember: async ({
			memberId,
			organizationId,
			userId: _userId,
		}: {
			memberId: string;
			organizationId: string;
			userId?: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			let userId: string;
			if (!_userId) {
				const member = await adapter.findOne<Member>({
					model: "member",
					where: [{ field: "id", value: memberId }],
				});
				if (!member) {
					throw new BetterAuthError("Member not found");
				}
				userId = member.userId;
			} else {
				userId = _userId;
			}
			const member = await adapter.delete<InferMember<O, false>>({
				model: "member",
				where: [
					{
						field: "id",
						value: memberId,
					},
				],
			});
			// remove member from all teams they're part of
			if (options?.teams?.enabled) {
				const teams = await adapter.findMany<Team>({
					model: "team",
					where: [{ field: "organizationId", value: organizationId }],
				});
				await Promise.all(
					teams.map((team) =>
						adapter.deleteMany({
							model: "teamMember",
							where: [
								{ field: "teamId", value: team.id },
								{ field: "userId", value: userId },
							],
						}),
					),
				);
			}
			return member;
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
		setActiveOrganization: async (
			sessionToken: string,
			organizationId: string | null,
			ctx: GenericEndpointContext,
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
			const adapter = await getCurrentAdapter(baseAdapter);
			const organization = await adapter.findOne<InferOrganization<O, false>>({
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
		checkMembership: async ({
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
			return member;
		},
		/**
		 * @requires db
		 */
		findFullOrganization: async ({
			organizationId,
			isSlug,
			includeTeams,
			membersLimit,
		}: {
			organizationId: string;
			isSlug?: boolean | undefined;
			includeTeams?: boolean | undefined;
			membersLimit?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findOne<
				InferOrganization<O, false> & {
					invitation: InferInvitation<O>[];
					member: InferMember<O>[];
					team: InferTeam<O>[] | undefined;
				}
			>({
				model: "organization",
				where: [{ field: isSlug ? "slug" : "id", value: organizationId }],
				join: {
					invitation: true,
					member: membersLimit ? { limit: membersLimit } : true,
					...(includeTeams ? { team: true } : {}),
				},
			});
			if (!result) {
				return null;
			}

			const {
				invitation: invitations,
				member: members,
				team: teams,
				...org
			} = result;
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

			// Get role assignments for all members
			const memberIds = members.map((m) => m.id);
			const roleAssignments =
				memberIds.length > 0
					? await adapter.findMany<MemberOrganizationRole>({
							model: "memberOrganizationRole",
							where: [{ field: "memberId", value: memberIds, operator: "in" }],
						})
					: [];
			const rolesMap = new Map<string, string[]>();
			roleAssignments.forEach((ra) => {
				const existing = rolesMap.get(ra.memberId) || [];
				existing.push(ra.role);
				rolesMap.set(ra.memberId, existing);
			});
			return {
				...org,
				invitations,
				members: membersWithUsers.map((member) => ({
					...member,
					organizationRoles: rolesMap.get(member.id) || [],
				})),
				teams,
			};
		},
		listOrganizations: async (userId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findMany<
				InferMember<O, false> & { organization: InferOrganization<O, false> }
			>({
				model: "member",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
				join: {
					organization: true,
				},
			});

			if (!result || result.length === 0) {
				return [];
			}

			const organizations = result.map((member) => member.organization);

			return organizations;
		},
		createTeam: async (data: Omit<TeamInput, "id">) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const team = await adapter.create<
				Omit<TeamInput, "id">,
				InferTeam<O, false>
			>({
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
			organizationId?: string | undefined;
			includeTeamMembers?: IncludeMembers | undefined;
		}): Promise<
			| (InferTeam<O> &
					(IncludeMembers extends true ? { members: TeamMember[] } : {}))
			| null
		> => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const result = await adapter.findOne<
				InferTeam<O> & { teamMember: TeamMember[] }
			>({
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
				join: {
					// In the future when `join` support is better, we can apply the `membershipLimit` here. Right now we're just querying 100.
					...(includeTeamMembers ? { teamMember: true } : {}),
				},
			});
			if (!result) {
				return null;
			}
			const { teamMember, ...team } = result;

			return {
				...team,
				...(includeTeamMembers ? { members: teamMember } : {}),
			} as any;
		},
		updateTeam: async (
			teamId: string,
			data: {
				name?: string | undefined;
				description?: string | undefined;
				status?: string | undefined;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			if ("id" in data) data.id = undefined;
			const team = await adapter.update<
				InferTeam<O, false> & InferAdditionalFieldsFromPluginOptions<"team", O>
			>({
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
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.deleteMany({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: teamId,
					},
				],
			});

			const team = await adapter.delete<InferTeam<O, false>>({
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
			const adapter = await getCurrentAdapter(baseAdapter);
			const teams = await adapter.findMany<InferTeam<O, false>>({
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
			teamRoles,
			teamId,
			organizationId,
			inviterId,
			expiresIn = 1000 * 60 * 60 * 48, // Default expiration: 48 hours
		}: {
			email: string;
			teamRoles?: string[];
			teamId: string;
			organizationId: string;
			inviterId: string;
			expiresIn?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const expiresAt = getDate(expiresIn); // Get expiration date

			const invitation = await adapter.create<
				InvitationInput,
				InferInvitation<O>
			>({
				model: "invitation",
				data: {
					email,
					teamRoles: teamRoles || [],
					organizationId,
					teamIds: teamId,
					inviterId,
					status: "pending",
					expiresAt,
				},
			});

			return invitation;
		},

		setActiveTeam: async (
			sessionToken: string,
			teamId: string | null,
			ctx: GenericEndpointContext,
		) => {
			const session = await context.internalAdapter.updateSession(
				sessionToken,
				{
					activeTeamId: teamId,
				},
			);
			return session as Session;
		},

		listTeamMembers: async (data: { teamId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const members = await adapter.findMany<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
				],
			});

			return members;
		},
		countTeamMembers: async (data: { teamId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "teamMember",
				where: [{ field: "teamId", value: data.teamId }],
			});
			return count;
		},
		countMembers: async (data: { organizationId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "member",
				where: [{ field: "organizationId", value: data.organizationId }],
			});
			return count;
		},
		listTeamsByUser: async (data: { userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const results = await adapter.findMany<TeamMember & { team: Team }>({
				model: "teamMember",
				where: [
					{
						field: "userId",
						value: data.userId,
					},
				],
				join: {
					team: true,
				},
			});

			return results.map((result) => result.team);
		},

		findTeamMember: async (data: { teamId: string; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
					{
						field: "userId",
						value: data.userId,
					},
				],
			});

			return member;
		},

		findOrCreateTeamMember: async (data: {
			teamId: string;
			userId: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const member = await adapter.findOne<TeamMember>({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
					{
						field: "userId",
						value: data.userId,
					},
				],
			});

			if (member) return member;

			return await adapter.create<Omit<TeamMember, "id">, TeamMember>({
				model: "teamMember",
				data: {
					teamId: data.teamId,
					userId: data.userId,
					createdAt: new Date(),
				},
			});
		},
		removeTeamMember: async (data: { teamId: string; userId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// use `deleteMany` instead of `delete` since Prisma requires 1 unique field for normal `delete` operations
			// FKs do not count thus breaking the operation. As a solution, we'll use `deleteMany` instead.
			await adapter.deleteMany({
				model: "teamMember",
				where: [
					{
						field: "teamId",
						value: data.teamId,
					},
					{
						field: "userId",
						value: data.userId,
					},
				],
			});
		},
		findInvitationsByTeamId: async (teamId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
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
		listUserInvitations: async (email: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
				model: "invitation",
				where: [{ field: "email", value: email.toLowerCase() }],
			});
			return invitations;
		},
		createInvitation: async ({
			invitation,
			user,
		}: {
			invitation: {
				email: string;
				organizationRoles?: string[];
				teamRoles?: string[];
				organizationId: string;
				teamIds: string[] | null;
			} & Record<string, any>; // This represents the additionalFields for the invitation
			user: User;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const defaultExpiration = 60 * 60 * 48;
			const expiresAt = getDate(
				options?.invitationExpiresIn || defaultExpiration,
				"sec",
			);
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
					organizationRoles: invitation.organizationRoles || [],
					teamRoles: invitation.teamRoles || [],
					teamIds:
						invitation.teamIds && invitation.teamIds.length > 0
							? invitation.teamIds.join(",")
							: undefined,
				},
			});

			return {
				...invite,
				teamIds: invite.teamIds ? invite.teamIds.split(",") : null,
			};
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
			return invitation;
		},
		findPendingInvitation: async (data: {
			email: string;
			organizationId: string;
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
				],
			});
			return invitation.filter(
				(invite) => new Date(invite.expiresAt) > new Date(),
			);
		},
		findPendingInvitations: async (data: { organizationId: string }) => {
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
				],
			});
			return invitations.filter(
				(invite) => new Date(invite.expiresAt) > new Date(),
			);
		},
		listInvitations: async (data: { organizationId: string }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const invitations = await adapter.findMany<InferInvitation<O, false>>({
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
	};

	return orgAdapter;
};
