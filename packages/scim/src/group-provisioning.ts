import { base64Url } from "@better-auth/utils/base64";
import type {
	Account,
	DBAdapter,
	GenericEndpointContext,
	User,
} from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import type { Member } from "better-auth/plugins";
import { SCIMAPIError } from "./scim-error";
import type { SCIMFilterWhere } from "./scim-filters";
import { parseSCIMGroupFilter, SCIMParseError } from "./scim-filters";
import type {
	SCIMGroup,
	SCIMGroupInput,
	SCIMGroupMember,
	SCIMGroupMemberInput,
	SCIMGroupMemberReference,
	SCIMGroupRole,
	SCIMGroupRoleGrant,
	SCIMOptions,
	SCIMUserGroupReference,
} from "./types";
import { getResourceURL } from "./utils";

type SCIMGroupAdapter = Pick<
	DBAdapter,
	| "count"
	| "create"
	| "delete"
	| "deleteMany"
	| "findMany"
	| "findOne"
	| "update"
>;

type SCIMGroupView = {
	group: SCIMGroup;
	members: SCIMGroupMemberReference[];
};

type SCIMGroupPatchOperation = {
	op: "add" | "remove" | "replace";
	path?: string;
	value?: unknown;
};

type SCIMGroupPatchInput = {
	Operations: SCIMGroupPatchOperation[];
};

type SCIMGroupState = {
	externalId?: string;
	displayName: string;
	members: SCIMGroupMemberInput[];
};

type SCIMProviderScope = {
	providerId: string;
	organizationId: string;
};

const defaultRole = "member";

function createScopedKey(parts: string[]): string {
	return base64Url.encode(JSON.stringify(parts));
}

function getProviderScope(ctx: GenericEndpointContext) {
	const { providerId, organizationId } = ctx.context.scimProvider;
	if (!organizationId) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "SCIM Group provisioning requires an organization-scoped token",
			scimType: "invalidValue",
		});
	}
	return { providerId, organizationId };
}

function getGroupExternalIdKey(input: {
	providerId: string;
	organizationId: string;
	externalId?: string;
}) {
	if (!input.externalId) return undefined;
	return createScopedKey([
		"scim-group-external-id",
		input.providerId,
		input.organizationId,
		input.externalId,
	]);
}

function getGroupMembershipKey(input: { groupId: string; userId: string }) {
	return createScopedKey(["scim-group-member", input.groupId, input.userId]);
}

function getGroupRoleKey(input: { groupId: string; role: string }) {
	return createScopedKey(["scim-group-role", input.groupId, input.role]);
}

function getGroupRoleGrantKey(input: {
	groupId: string;
	userId: string;
	role: string;
}) {
	return createScopedKey([
		"scim-group-role-grant",
		input.groupId,
		input.userId,
		input.role,
	]);
}

function getRoleProjectionKey(input: { userId: string; role: string }) {
	return createScopedKey(["scim-role-projection", input.userId, input.role]);
}

function parseRoles(role: string): string[] {
	return role
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function serializeRoles(roles: Set<string>): string {
	return Array.from(roles).join(",");
}

function getUniqueMemberIds(members: SCIMGroupMemberInput[] | undefined) {
	const userIds = new Set<string>();
	for (const member of members ?? []) {
		const memberType = member.type?.toLowerCase();
		if (memberType && memberType !== "user") {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "Nested SCIM Group members are not supported",
				scimType: "invalidValue",
			});
		}
		if (!member.value) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group members must reference a User id",
				scimType: "invalidValue",
			});
		}
		userIds.add(member.value);
	}
	return Array.from(userIds);
}

function normalizeRoles(roles: string | string[]): string[] {
	const normalizedRoles = (Array.isArray(roles) ? roles : [roles])
		.flatMap((role) => role.split(","))
		.map((role) => role.trim())
		.filter(Boolean);

	const uniqueRoles = Array.from(new Set(normalizedRoles));
	if (uniqueRoles.length === 0) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "SCIM Group role mapping must return at least one role",
			scimType: "invalidValue",
		});
	}
	return uniqueRoles;
}

async function mapGroupToRoles(
	opts: SCIMOptions,
	group: SCIMGroupInput,
	provider: { providerId: string; organizationId: string },
) {
	const mappedRoles = opts.mapGroupToRoles
		? await opts.mapGroupToRoles({ group, provider })
		: group.displayName;
	return normalizeRoles(mappedRoles);
}

async function assertExternalIdAvailable(
	adapter: SCIMGroupAdapter,
	input: {
		providerId: string;
		organizationId: string;
		externalId?: string;
		currentGroupId?: string;
	},
) {
	const externalIdKey = getGroupExternalIdKey(input);
	if (!externalIdKey) return;
	const existingGroup = await adapter.findOne<SCIMGroup>({
		model: "scimGroup",
		where: [{ field: "externalIdKey", value: externalIdKey }],
	});
	if (existingGroup && existingGroup.id !== input.currentGroupId) {
		throw new SCIMAPIError("CONFLICT", {
			detail: "SCIM Group externalId already exists",
			scimType: "uniqueness",
		});
	}
}

async function validateGroupMembers(
	adapter: SCIMGroupAdapter,
	input: {
		userIds: string[];
		providerId: string;
		organizationId: string;
	},
) {
	if (input.userIds.length === 0) return;

	const [accounts, members, users] = await Promise.all([
		adapter.findMany<Account>({
			model: "account",
			where: [
				{ field: "providerId", value: input.providerId },
				{ field: "userId", value: input.userIds, operator: "in" },
			],
		}),
		adapter.findMany<Member>({
			model: "member",
			where: [
				{ field: "organizationId", value: input.organizationId },
				{ field: "userId", value: input.userIds, operator: "in" },
			],
		}),
		adapter.findMany<User>({
			model: "user",
			where: [{ field: "id", value: input.userIds, operator: "in" }],
		}),
	]);

	const accountUserIds = new Set(accounts.map((account) => account.userId));
	const memberUserIds = new Set(members.map((member) => member.userId));
	const existingUserIds = new Set(users.map((user) => user.id));

	for (const userId of input.userIds) {
		const isProvisionedUser =
			accountUserIds.has(userId) &&
			memberUserIds.has(userId) &&
			existingUserIds.has(userId);
		if (!isProvisionedUser) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group member does not reference a provisioned User",
				scimType: "noTarget",
			});
		}
	}
}

async function findGroupBySCIMId(
	adapter: SCIMGroupAdapter,
	input: {
		providerId: string;
		organizationId: string;
		scimGroupId: string;
	},
) {
	return adapter.findOne<SCIMGroup>({
		model: "scimGroup",
		where: [
			{ field: "providerId", value: input.providerId },
			{ field: "organizationId", value: input.organizationId },
			{ field: "scimGroupId", value: input.scimGroupId },
		],
	});
}

async function listGroupMembers(adapter: SCIMGroupAdapter, groupId: string) {
	return adapter.findMany<SCIMGroupMember>({
		model: "scimGroupMember",
		where: [{ field: "groupId", value: groupId }],
	});
}

async function createGroupMemberReferences(
	ctx: GenericEndpointContext,
	groupId: string,
): Promise<SCIMGroupMemberReference[]> {
	const groupMembers = await listGroupMembers(ctx.context.adapter, groupId);
	if (groupMembers.length === 0) return [];

	const users = await ctx.context.adapter.findMany<User>({
		model: "user",
		where: [
			{
				field: "id",
				value: groupMembers.map((member) => member.userId),
				operator: "in",
			},
		],
	});
	const userById = new Map(users.map((user) => [user.id, user]));

	return groupMembers
		.map((member) => {
			const user = userById.get(member.userId);
			if (!user) return null;
			return {
				value: user.id,
				$ref: getResourceURL(
					`/scim/v2/Users/${encodeURIComponent(user.id)}`,
					ctx.context.baseURL,
				),
				display: user.name || user.email,
				type: "User" as const,
			};
		})
		.filter((member): member is SCIMGroupMemberReference => Boolean(member));
}

async function createGroupView(
	ctx: GenericEndpointContext,
	group: SCIMGroup,
): Promise<SCIMGroupView> {
	return {
		group,
		members: await createGroupMemberReferences(ctx, group.id),
	};
}

async function deleteGroupRoles(adapter: SCIMGroupAdapter, groupId: string) {
	await adapter.deleteMany({
		model: "scimGroupRole",
		where: [{ field: "groupId", value: groupId }],
	});
}

async function replaceGroupRoles(
	adapter: SCIMGroupAdapter,
	groupId: string,
	roles: string[],
) {
	await deleteGroupRoles(adapter, groupId);
	for (const role of roles) {
		await adapter.create<Omit<SCIMGroupRole, "id">>({
			model: "scimGroupRole",
			data: {
				groupId,
				role,
				roleKey: getGroupRoleKey({ groupId, role }),
				createdAt: new Date(),
			},
		});
	}
}

async function replaceGroupMembers(
	adapter: SCIMGroupAdapter,
	input: {
		group: SCIMGroup;
		userIds: string[];
	},
) {
	await adapter.deleteMany({
		model: "scimGroupMember",
		where: [{ field: "groupId", value: input.group.id }],
	});

	for (const userId of input.userIds) {
		await adapter.create<Omit<SCIMGroupMember, "id">>({
			model: "scimGroupMember",
			data: {
				groupId: input.group.id,
				providerId: input.group.providerId,
				organizationId: input.group.organizationId,
				userId,
				membershipKey: getGroupMembershipKey({
					groupId: input.group.id,
					userId,
				}),
				createdAt: new Date(),
			},
		});
	}
}

async function findOrganizationMember(
	adapter: SCIMGroupAdapter,
	input: { organizationId: string; userId: string },
) {
	return adapter.findOne<Member>({
		model: "member",
		where: [
			{ field: "organizationId", value: input.organizationId },
			{ field: "userId", value: input.userId },
		],
	});
}

async function listOrganizationMembers(
	adapter: SCIMGroupAdapter,
	input: { organizationId: string; userIds: string[] },
) {
	if (input.userIds.length === 0) return new Map<string, Member>();
	const members = await adapter.findMany<Member>({
		model: "member",
		where: [
			{ field: "organizationId", value: input.organizationId },
			{ field: "userId", value: input.userIds, operator: "in" },
		],
	});
	return new Map(members.map((member) => [member.userId, member]));
}

async function addProjectedRole(
	adapter: SCIMGroupAdapter,
	input: {
		member: Member;
		role: string;
	},
) {
	const roles = new Set(parseRoles(input.member.role));
	if (roles.has(input.role)) return false;
	roles.add(input.role);
	const serializedRoles = serializeRoles(roles);
	await adapter.update<Member>({
		model: "member",
		where: [{ field: "id", value: input.member.id }],
		update: { role: serializedRoles },
	});
	input.member.role = serializedRoles;
	return true;
}

async function removeProjectedRole(
	adapter: SCIMGroupAdapter,
	input: {
		organizationId: string;
		userId: string;
		role: string;
	},
) {
	const remainingGrant = await adapter.findOne<SCIMGroupRoleGrant>({
		model: "scimGroupRoleGrant",
		where: [
			{ field: "organizationId", value: input.organizationId },
			{ field: "userId", value: input.userId },
			{ field: "role", value: input.role },
		],
	});
	if (remainingGrant) return;

	const member = await findOrganizationMember(adapter, input);
	if (!member) return;

	const roles = new Set(parseRoles(member.role));
	if (!roles.has(input.role)) return;
	roles.delete(input.role);
	if (roles.size === 0) roles.add(defaultRole);
	await adapter.update<Member>({
		model: "member",
		where: [{ field: "id", value: member.id }],
		update: { role: serializeRoles(roles) },
	});
}

async function replaceGroupRoleGrants(
	adapter: SCIMGroupAdapter,
	input: {
		group: SCIMGroup;
		userIds: string[];
		roles: string[];
	},
) {
	const existingGrants = await adapter.findMany<SCIMGroupRoleGrant>({
		model: "scimGroupRoleGrant",
		where: [{ field: "groupId", value: input.group.id }],
	});
	const desiredGrantKeys = new Set(
		input.userIds.flatMap((userId) =>
			input.roles.map((role) =>
				getGroupRoleGrantKey({ groupId: input.group.id, userId, role }),
			),
		),
	);

	const deletedProjectedGrants = existingGrants.filter(
		(grant) =>
			!desiredGrantKeys.has(grant.roleGrantKey) && grant.isRoleProjected,
	);
	const grantsToDelete = existingGrants.filter(
		(grant) => !desiredGrantKeys.has(grant.roleGrantKey),
	);
	const [membersByUserId, existingRoleGrants] = await Promise.all([
		listOrganizationMembers(adapter, {
			organizationId: input.group.organizationId,
			userIds: input.userIds,
		}),
		input.userIds.length > 0 && input.roles.length > 0
			? adapter.findMany<SCIMGroupRoleGrant>({
					model: "scimGroupRoleGrant",
					where: [
						{ field: "organizationId", value: input.group.organizationId },
						{ field: "userId", value: input.userIds, operator: "in" },
						{ field: "role", value: input.roles, operator: "in" },
					],
				})
			: [],
	]);
	const projectedRoleKeys = new Set(
		existingRoleGrants
			.filter((grant) => grant.isRoleProjected)
			.map((grant) =>
				getRoleProjectionKey({
					userId: grant.userId,
					role: grant.role,
				}),
			),
	);

	if (grantsToDelete.length > 0) {
		await adapter.deleteMany({
			model: "scimGroupRoleGrant",
			where: [
				{
					field: "roleGrantKey",
					value: grantsToDelete.map((grant) => grant.roleGrantKey),
					operator: "in",
				},
			],
		});
	}

	for (const grant of deletedProjectedGrants) {
		await removeProjectedRole(adapter, {
			organizationId: grant.organizationId,
			userId: grant.userId,
			role: grant.role,
		});
	}

	const existingGrantKeys = new Set(
		existingGrants.map((grant) => grant.roleGrantKey),
	);
	for (const userId of input.userIds) {
		const member = membersByUserId.get(userId);
		if (!member) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group member does not reference an organization member",
				scimType: "noTarget",
			});
		}

		for (const role of input.roles) {
			const roleGrantKey = getGroupRoleGrantKey({
				groupId: input.group.id,
				userId,
				role,
			});
			if (existingGrantKeys.has(roleGrantKey)) continue;
			const roleProjectionKey = getRoleProjectionKey({ userId, role });
			const isRoleProjected =
				projectedRoleKeys.has(roleProjectionKey) ||
				(await addProjectedRole(adapter, {
					member,
					role,
				}));
			if (isRoleProjected) {
				projectedRoleKeys.add(roleProjectionKey);
			}
			await adapter.create<Omit<SCIMGroupRoleGrant, "id">>({
				model: "scimGroupRoleGrant",
				data: {
					groupId: input.group.id,
					providerId: input.group.providerId,
					organizationId: input.group.organizationId,
					userId,
					role,
					roleGrantKey,
					isRoleProjected,
					createdAt: new Date(),
				},
			});
		}
	}
}

async function replaceGroupState(
	adapter: SCIMGroupAdapter,
	input: {
		group: SCIMGroup;
		state: SCIMGroupState;
		roles: string[];
		userIds: string[];
	},
) {
	const externalIdKey = getGroupExternalIdKey({
		providerId: input.group.providerId,
		organizationId: input.group.organizationId,
		externalId: input.state.externalId,
	});

	const updatedGroup = await adapter.update<SCIMGroup>({
		model: "scimGroup",
		where: [{ field: "id", value: input.group.id }],
		update: {
			externalId: input.state.externalId,
			externalIdKey,
			displayName: input.state.displayName,
			updatedAt: new Date(),
		},
	});
	if (!updatedGroup) {
		throw new SCIMAPIError("NOT_FOUND", {
			detail: "SCIM Group not found",
		});
	}

	await replaceGroupRoles(adapter, updatedGroup.id, input.roles);
	await replaceGroupMembers(adapter, {
		group: updatedGroup,
		userIds: input.userIds,
	});
	await replaceGroupRoleGrants(adapter, {
		group: updatedGroup,
		userIds: input.userIds,
		roles: input.roles,
	});

	return updatedGroup;
}

export async function createSCIMGroupResource(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	input: SCIMGroupInput,
) {
	const provider = getProviderScope(ctx);
	const userIds = getUniqueMemberIds(input.members);
	const roles = await mapGroupToRoles(opts, input, provider);

	await assertExternalIdAvailable(ctx.context.adapter, {
		...provider,
		externalId: input.externalId,
	});
	await validateGroupMembers(ctx.context.adapter, { ...provider, userIds });

	const group = await ctx.context.adapter.transaction<SCIMGroup>(
		async (trx) => {
			const now = new Date();
			const newGroup = await trx.create<Omit<SCIMGroup, "id">, SCIMGroup>({
				model: "scimGroup",
				data: {
					...provider,
					scimGroupId: generateRandomString(32),
					externalId: input.externalId,
					externalIdKey: getGroupExternalIdKey({
						...provider,
						externalId: input.externalId,
					}),
					displayName: input.displayName,
					createdAt: now,
					updatedAt: now,
				},
			});

			await replaceGroupRoles(trx, newGroup.id, roles);
			await replaceGroupMembers(trx, { group: newGroup, userIds });
			await replaceGroupRoleGrants(trx, {
				group: newGroup,
				userIds,
				roles,
			});
			return newGroup;
		},
	);

	return createGroupView(ctx, group);
}

export async function findSCIMGroupResource(
	ctx: GenericEndpointContext,
	scimGroupId: string,
) {
	const provider = getProviderScope(ctx);
	const group = await findGroupBySCIMId(ctx.context.adapter, {
		...provider,
		scimGroupId,
	});
	if (!group) {
		throw new SCIMAPIError("NOT_FOUND", {
			detail: "SCIM Group not found",
		});
	}
	return createGroupView(ctx, group);
}

export async function listSCIMGroupResources(
	ctx: GenericEndpointContext,
	query?: { filter?: string; startIndex?: number; count?: number },
) {
	const provider = getProviderScope(ctx);
	const filters = parseSCIMAPIGroupFilter(query?.filter);
	const where = [
		{ field: "providerId", value: provider.providerId },
		{ field: "organizationId", value: provider.organizationId },
		...filters,
	];
	const startIndex = Math.max(query?.startIndex ?? 1, 1);
	const count = query?.count;

	const [totalResults, groups] = await Promise.all([
		ctx.context.adapter.count({
			model: "scimGroup",
			where,
		}),
		ctx.context.adapter.findMany<SCIMGroup>({
			model: "scimGroup",
			where,
			offset: startIndex - 1,
			...(count !== undefined ? { limit: count } : {}),
		}),
	]);

	const groupViews = await Promise.all(
		groups.map((group) => createGroupView(ctx, group)),
	);

	return {
		schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
		totalResults,
		startIndex,
		itemsPerPage: groupViews.length,
		Resources: groupViews,
	};
}

export async function replaceSCIMGroupResource(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	scimGroupId: string,
	input: SCIMGroupInput,
) {
	const provider = getProviderScope(ctx);
	const group = await findGroupBySCIMId(ctx.context.adapter, {
		...provider,
		scimGroupId,
	});
	if (!group) {
		throw new SCIMAPIError("NOT_FOUND", {
			detail: "SCIM Group not found",
		});
	}

	const state = {
		externalId: input.externalId,
		displayName: input.displayName,
		members: input.members ?? [],
	};
	const userIds = getUniqueMemberIds(state.members);
	const roles = await mapGroupToRoles(opts, state, provider);

	await assertExternalIdAvailable(ctx.context.adapter, {
		...provider,
		externalId: state.externalId,
		currentGroupId: group.id,
	});
	await validateGroupMembers(ctx.context.adapter, { ...provider, userIds });

	const updatedGroup = await ctx.context.adapter.transaction<SCIMGroup>(
		async (trx) => replaceGroupState(trx, { group, state, roles, userIds }),
	);
	return createGroupView(ctx, updatedGroup);
}

export async function applySCIMGroupPatch(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	scimGroupId: string,
	patch: SCIMGroupPatchInput,
) {
	const provider = getProviderScope(ctx);
	const group = await findGroupBySCIMId(ctx.context.adapter, {
		...provider,
		scimGroupId,
	});
	if (!group) {
		throw new SCIMAPIError("NOT_FOUND", {
			detail: "SCIM Group not found",
		});
	}

	const groupMembers = await listGroupMembers(ctx.context.adapter, group.id);
	const state: SCIMGroupState = {
		externalId: group.externalId,
		displayName: group.displayName,
		members: groupMembers.map((member) => ({ value: member.userId })),
	};

	for (const operation of patch.Operations) {
		applyGroupPatchOperation(state, operation);
	}

	const userIds = getUniqueMemberIds(state.members);
	const roles = await mapGroupToRoles(opts, state, provider);

	await assertExternalIdAvailable(ctx.context.adapter, {
		...provider,
		externalId: state.externalId,
		currentGroupId: group.id,
	});
	await validateGroupMembers(ctx.context.adapter, { ...provider, userIds });

	const updatedGroup = await ctx.context.adapter.transaction<SCIMGroup>(
		async (trx) => replaceGroupState(trx, { group, state, roles, userIds }),
	);
	return createGroupView(ctx, updatedGroup);
}

export async function deleteSCIMGroupResource(
	ctx: GenericEndpointContext,
	scimGroupId: string,
) {
	const provider = getProviderScope(ctx);
	const group = await findGroupBySCIMId(ctx.context.adapter, {
		...provider,
		scimGroupId,
	});
	if (!group) {
		throw new SCIMAPIError("NOT_FOUND", {
			detail: "SCIM Group not found",
		});
	}

	await ctx.context.adapter.transaction(async (trx) => {
		await replaceGroupRoleGrants(trx, { group, userIds: [], roles: [] });
		await trx.deleteMany({
			model: "scimGroupMember",
			where: [{ field: "groupId", value: group.id }],
		});
		await trx.deleteMany({
			model: "scimGroupRole",
			where: [{ field: "groupId", value: group.id }],
		});
		await trx.delete({
			model: "scimGroup",
			where: [{ field: "id", value: group.id }],
		});
	});
}

export async function removeUserFromSCIMGroups(
	adapter: SCIMGroupAdapter,
	input: SCIMProviderScope & { userId: string },
) {
	const grants = await adapter.findMany<SCIMGroupRoleGrant>({
		model: "scimGroupRoleGrant",
		where: [
			{ field: "providerId", value: input.providerId },
			{ field: "organizationId", value: input.organizationId },
			{ field: "userId", value: input.userId },
		],
	});

	if (grants.length > 0) {
		await adapter.deleteMany({
			model: "scimGroupRoleGrant",
			where: [
				{
					field: "roleGrantKey",
					value: grants.map((grant) => grant.roleGrantKey),
					operator: "in",
				},
			],
		});
	}

	await adapter.deleteMany({
		model: "scimGroupMember",
		where: [
			{ field: "providerId", value: input.providerId },
			{ field: "organizationId", value: input.organizationId },
			{ field: "userId", value: input.userId },
		],
	});
}

export async function listSCIMGroupReferencesByUser(
	ctx: GenericEndpointContext,
	userIds: string[],
): Promise<Map<string, SCIMUserGroupReference[]>> {
	const provider = getProviderScope(ctx);
	const uniqueUserIds = Array.from(new Set(userIds));
	if (uniqueUserIds.length === 0) return new Map();

	const groupMembers = await ctx.context.adapter.findMany<SCIMGroupMember>({
		model: "scimGroupMember",
		where: [
			{ field: "providerId", value: provider.providerId },
			{ field: "organizationId", value: provider.organizationId },
			{ field: "userId", value: uniqueUserIds, operator: "in" },
		],
	});
	if (groupMembers.length === 0) return new Map();

	const groups = await ctx.context.adapter.findMany<SCIMGroup>({
		model: "scimGroup",
		where: [
			{
				field: "id",
				value: Array.from(
					new Set(groupMembers.map((member) => member.groupId)),
				),
				operator: "in",
			},
		],
	});
	const groupById = new Map(groups.map((group) => [group.id, group]));
	const groupReferencesByUserId = new Map<string, SCIMUserGroupReference[]>();

	for (const member of groupMembers) {
		const group = groupById.get(member.groupId);
		if (!group) continue;

		const groupReferences = groupReferencesByUserId.get(member.userId) ?? [];
		groupReferences.push({
			value: group.scimGroupId,
			$ref: getResourceURL(
				`/scim/v2/Groups/${encodeURIComponent(group.scimGroupId)}`,
				ctx.context.baseURL,
			),
			display: group.displayName,
		});
		groupReferencesByUserId.set(member.userId, groupReferences);
	}

	return groupReferencesByUserId;
}

export async function listUserSCIMGroupReferences(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<SCIMUserGroupReference[]> {
	const groupReferencesByUserId = await listSCIMGroupReferencesByUser(ctx, [
		userId,
	]);
	return groupReferencesByUserId.get(userId) ?? [];
}

function parseSCIMAPIGroupFilter(filter?: string): SCIMFilterWhere[] {
	if (!filter) return [];
	try {
		return parseSCIMGroupFilter(filter);
	} catch (error) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail:
				error instanceof SCIMParseError ? error.message : "Invalid SCIM filter",
			scimType: "invalidFilter",
		});
	}
}

function normalizePatchPath(path?: string) {
	if (!path) return undefined;
	const withoutLeadingSlash = path.startsWith("/") ? path.slice(1) : path;
	return withoutLeadingSlash;
}

function getPatchMembers(value: unknown): SCIMGroupMemberInput[] {
	if (!Array.isArray(value)) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "SCIM Group members patch value must be an array",
			scimType: "invalidValue",
		});
	}
	return value.map((member) => {
		if (!member || typeof member !== "object" || Array.isArray(member)) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group members patch value must contain member objects",
				scimType: "invalidValue",
			});
		}
		const candidate = member as Record<string, unknown>;
		if (typeof candidate.value !== "string" || candidate.value.length === 0) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group members patch value must include a User id",
				scimType: "invalidValue",
			});
		}
		return {
			value: candidate.value,
			$ref: typeof candidate.$ref === "string" ? candidate.$ref : undefined,
			display:
				typeof candidate.display === "string" ? candidate.display : undefined,
			type: typeof candidate.type === "string" ? candidate.type : undefined,
		};
	});
}

function getPatchString(value: unknown, attribute: string) {
	if (typeof value !== "string") {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: `SCIM Group ${attribute} patch value must be a string`,
			scimType: "invalidValue",
		});
	}
	return value;
}

function getRequiredPatchString(value: unknown, attribute: string) {
	const stringValue = getPatchString(value, attribute);
	if (stringValue.length === 0) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: `SCIM Group ${attribute} is required`,
			scimType: "invalidValue",
		});
	}
	return stringValue;
}

function addGroupMembers(
	state: SCIMGroupState,
	members: SCIMGroupMemberInput[],
) {
	const membersByValue = new Map(
		state.members
			.filter((member) => member.value)
			.map((member) => [member.value, member]),
	);
	for (const member of members) {
		if (!member.value || membersByValue.has(member.value)) continue;
		membersByValue.set(member.value, member);
	}
	state.members = Array.from(membersByValue.values());
}

function removeGroupMembers(
	state: SCIMGroupState,
	members: SCIMGroupMemberInput[],
) {
	const removedUserIds = new Set(
		members
			.map((member) => member.value)
			.filter((value): value is string => {
				return Boolean(value);
			}),
	);
	state.members = state.members.filter(
		(member) => !member.value || !removedUserIds.has(member.value),
	);
}

function applyGroupPatchObject(
	state: SCIMGroupState,
	op: "add" | "replace",
	value: unknown,
) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "SCIM Group patch value must be an object",
			scimType: "invalidValue",
		});
	}

	const patchValue = value as Record<string, unknown>;
	if ("displayName" in patchValue) {
		state.displayName = getRequiredPatchString(
			patchValue.displayName,
			"displayName",
		);
	}
	if (typeof patchValue.externalId === "string") {
		state.externalId = patchValue.externalId;
	}
	if (Array.isArray(patchValue.members)) {
		const members = getPatchMembers(patchValue.members);
		if (op === "replace") {
			state.members = members;
		} else {
			addGroupMembers(state, members);
		}
	}
}

function applyGroupPatchOperation(
	state: SCIMGroupState,
	operation: SCIMGroupPatchOperation,
) {
	const path = normalizePatchPath(operation.path);
	if (!path) {
		if (operation.op === "remove") {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group remove patch operations require a path",
				scimType: "invalidPath",
			});
		}
		applyGroupPatchObject(state, operation.op, operation.value);
		return;
	}

	const memberFilter = path.match(/^members\[value eq "(?<userId>[^"]+)"\]$/i);
	if (memberFilter?.groups?.userId) {
		if (operation.op !== "remove") {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group member filters are only supported for remove",
				scimType: "invalidPath",
			});
		}
		removeGroupMembers(state, [{ value: memberFilter.groups.userId }]);
		return;
	}

	if (path === "displayName") {
		if (operation.op === "remove") {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "SCIM Group displayName is required",
				scimType: "invalidValue",
			});
		}
		state.displayName = getRequiredPatchString(operation.value, "displayName");
		return;
	}

	if (path === "externalId") {
		if (operation.op === "remove") {
			state.externalId = undefined;
			return;
		}
		state.externalId = getPatchString(operation.value, "externalId");
		return;
	}

	if (path === "members") {
		if (operation.op === "remove" && typeof operation.value === "undefined") {
			state.members = [];
			return;
		}
		const members = getPatchMembers(operation.value);
		if (operation.op === "add") {
			addGroupMembers(state, members);
			return;
		}
		if (operation.op === "replace") {
			state.members = members;
			return;
		}
		removeGroupMembers(state, members);
		return;
	}

	throw new SCIMAPIError("BAD_REQUEST", {
		detail: `Unsupported SCIM Group patch path: ${operation.path}`,
		scimType: "invalidPath",
	});
}
