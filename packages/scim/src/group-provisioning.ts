import type { DBAdapter, Where } from "better-auth";
import { HIDE_METADATA } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import type {
	SCIMAttributeProjection,
	SCIMCollectionQueryInput,
	SCIMEqualityFilter,
	SCIMGroupFilterAttribute,
} from "./collection-query";
import {
	parseSCIMAttributeProjection,
	parseSCIMCollectionQuery,
	scimAttributeProjectionQuerySchema,
	scimCollectionQuerySchema,
} from "./collection-query";
import type { SCIMConnection } from "./configuration";
import type { SCIMConnectionMiddleware } from "./connection-authentication";
import { fenceActiveSCIMConnection } from "./connection-state";
import { SCIM_MAX_GROUP_MEMBERS } from "./group-schemas";
import {
	acquireSCIMGroupMutationLock,
	findSCIMGroup,
	runGroupMutationTransaction,
} from "./group-state";
import type { SCIMGroup, SCIMGroupMember, SCIMUser } from "./persistence";
import type { SCIMProjectionCoordinator } from "./projection";
import { projectSCIMResourceAttributes } from "./resource-attribute-projection";
import { createSCIMOrderKey, createScopedKey } from "./resource-key";
import {
	SCIM_RESOURCE_SCHEMA_REGISTRY,
	stripSCIMCoreAttributePrefix,
} from "./resource-schema-registry";
import { runSCIMCreateWithUniquenessCheck } from "./resource-uniqueness";
import { createSCIMError, SCIMErrorOpenAPISchemas } from "./scim-error";
import {
	createSCIMOpenAPIContent,
	defineSCIMEndpointMetadata,
	getResourceURL,
	SCIM_REQUEST_MEDIA_TYPES,
} from "./scim-metadata";

const {
	inputSchema: APIGroupSchema,
	openAPISchema: OpenAPIGroupResourceSchema,
	schemaId: SCIM_GROUP_SCHEMA,
} = SCIM_RESOURCE_SCHEMA_REGISTRY.Group;
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_USER_ID_QUERY_CHUNK_SIZE = 500;

function requireGroupAttributeProjection(
	input: SCIMCollectionQueryInput,
): SCIMAttributeProjection {
	const projection = parseSCIMAttributeProjection("Group", input);
	if (!projection.ok) {
		throw createSCIMError("BAD_REQUEST", {
			detail: projection.error.detail,
			scimType: projection.error.scimType,
		});
	}
	return projection.value;
}

function requestsProjectedMutationResponse(
	input: SCIMCollectionQueryInput,
): boolean {
	return (
		input.attributes !== undefined || input.excludedAttributes !== undefined
	);
}

const patchSCIMGroupBodySchema = z.object({
	schemas: z
		.array(z.string())
		.refine((schemas) => schemas.includes(SCIM_PATCH_SCHEMA), {
			message: "Invalid schemas for PatchOp",
		}),
	Operations: z
		.array(
			z.object({
				op: z
					.string()
					.toLowerCase()
					.default("replace")
					.pipe(z.enum(["replace", "add", "remove"])),
				path: z.string().optional(),
				value: z.unknown().optional(),
			}),
		)
		.min(1),
});

const GROUP_MEMBER_VALUE_PATH =
	/^members\s*\[\s*value\s+eq\s+("(?:\\.|[^"\\])*")\s*\]$/i;

function createGroupExternalIdKey(
	connectionId: string,
	externalId?: string,
): string | undefined {
	if (!externalId) return undefined;
	return createScopedKey(["scim-group-external-id", connectionId, externalId]);
}

function createGroupDisplayNameKey(
	connectionId: string,
	displayName: string,
): string {
	return createScopedKey([
		"scim-group-display-name",
		connectionId,
		displayName.toLowerCase(),
	]);
}

function createGroupMembershipKey(
	connectionId: string,
	groupId: string,
	scimUserId: string,
): string {
	return createScopedKey([
		"scim-group-member",
		connectionId,
		groupId,
		scimUserId,
	]);
}

function createGroupCollectionWhere(
	connectionId: string,
	filters: readonly SCIMEqualityFilter<SCIMGroupFilterAttribute>[],
): Where[] {
	const where: Where[] = [{ field: "connectionId", value: connectionId }];
	for (const filter of filters) {
		switch (filter.attribute) {
			case "id":
				where.push({ field: "id", value: filter.value });
				break;
			case "displayName":
				where.push({
					field: "displayNameKey",
					value: createGroupDisplayNameKey(connectionId, filter.value),
				});
				break;
			case "externalId":
				where.push({
					field: "externalIdKey",
					value: createGroupExternalIdKey(connectionId, filter.value) ?? "",
				});
				break;
		}
	}

	return where;
}

async function assertGroupConnectionDomainStable(
	adapter: Pick<DBAdapter, "findOne">,
	connection: SCIMConnection,
): Promise<void> {
	const mismatched = await adapter.findOne<SCIMGroup>({
		model: "scimGroup",
		where: [
			{ field: "connectionId", value: connection.id },
			{
				field: "provisioningDomainId",
				value: connection.provisioningDomainId,
				operator: "ne",
			},
		],
	});
	if (mismatched) {
		throw createSCIMError("CONFLICT", {
			detail:
				"The connection provisioningDomainId changed after resources were created",
		});
	}
}

async function assertExternalIdAvailable(
	adapter: Pick<DBAdapter, "findOne">,
	connectionId: string,
	externalIdKey?: string,
	excludeGroupId?: string,
): Promise<void> {
	if (!externalIdKey) return;
	const existingGroup = await adapter.findOne<SCIMGroup>({
		model: "scimGroup",
		where: [
			{ field: "connectionId", value: connectionId },
			{ field: "externalIdKey", value: externalIdKey },
		],
	});
	if (existingGroup && existingGroup.id !== excludeGroupId) {
		throw createSCIMError("CONFLICT", {
			detail: "SCIM Group externalId already exists",
			scimType: "uniqueness",
		});
	}
}

async function assertDisplayNameAvailable(
	adapter: Pick<DBAdapter, "findOne">,
	connectionId: string,
	displayNameKey: string,
	excludeGroupId?: string,
): Promise<void> {
	const existingGroup = await adapter.findOne<SCIMGroup>({
		model: "scimGroup",
		where: [
			{ field: "connectionId", value: connectionId },
			{ field: "displayNameKey", value: displayNameKey },
		],
	});
	if (existingGroup && existingGroup.id !== excludeGroupId) {
		throw createSCIMError("CONFLICT", {
			detail: "SCIM Group displayName already exists",
			scimType: "uniqueness",
		});
	}
}

function normalizeGroupMemberIds(
	members: Array<{
		value?: string;
		type?: string;
	}>,
): string[] {
	const memberIds = new Set<string>();
	for (const member of members) {
		if (
			!member.value?.trim() ||
			(member.type !== undefined && member.type.toLowerCase() !== "user")
		) {
			throw createSCIMError("BAD_REQUEST", {
				detail: "Group members must reference a SCIM User",
				scimType: "invalidValue",
			});
		}
		memberIds.add(member.value);
	}
	return [...memberIds];
}

function assertGroupMemberCount(memberCount: number): void {
	if (memberCount <= SCIM_MAX_GROUP_MEMBERS) return;
	throw createSCIMError("BAD_REQUEST", {
		detail: `Groups cannot contain more than ${SCIM_MAX_GROUP_MEMBERS} direct members`,
		scimType: "invalidValue",
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPatchMemberIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw createSCIMError("BAD_REQUEST", {
			detail: "members must be an array",
			scimType: "invalidValue",
		});
	}
	assertGroupMemberCount(value.length);
	const members = value.map((member) => {
		if (!isRecord(member)) {
			throw createSCIMError("BAD_REQUEST", {
				detail: "Group members must reference a SCIM User",
				scimType: "invalidValue",
			});
		}
		return {
			value: typeof member.value === "string" ? member.value : undefined,
			type: typeof member.type === "string" ? member.type : undefined,
		};
	});
	return normalizeGroupMemberIds(members);
}

function readMemberIdFromValuePath(path: string): string | undefined {
	const quotedMemberId = normalizeGroupPatchPath(path).match(
		GROUP_MEMBER_VALUE_PATH,
	)?.[1];
	if (!quotedMemberId) return undefined;
	try {
		const memberId: unknown = JSON.parse(quotedMemberId);
		return typeof memberId === "string" && memberId ? memberId : undefined;
	} catch {
		return undefined;
	}
}

function normalizeGroupPatchPath(path: string): string {
	return stripSCIMCoreAttributePrefix("Group", path.trim());
}

interface IncrementalMembershipPatch {
	desiredMembershipByUserId: ReadonlyMap<string, boolean>;
	memberIdsToValidate: readonly string[];
}

function parseIncrementalMembershipPatch(
	operations: z.infer<typeof patchSCIMGroupBodySchema>["Operations"],
): IncrementalMembershipPatch | undefined {
	const desiredMembershipByUserId = new Map<string, boolean>();
	const memberIdsToValidate = new Set<string>();

	for (const operation of operations) {
		const path = operation.path?.trim();
		if (!path) return undefined;
		const normalizedPath = normalizeGroupPatchPath(path);
		if (normalizedPath.toLowerCase() === "members") {
			if (operation.op === "replace" || operation.value === undefined) {
				return undefined;
			}
			const memberIds = readPatchMemberIds(operation.value);
			const desired = operation.op === "add";
			for (const memberId of memberIds) {
				desiredMembershipByUserId.set(memberId, desired);
				if (desired) memberIdsToValidate.add(memberId);
			}
			continue;
		}

		const valuePathMemberId = readMemberIdFromValuePath(path);
		if (operation.op !== "remove" || !valuePathMemberId) return undefined;
		desiredMembershipByUserId.set(valuePathMemberId, false);
	}

	return {
		desiredMembershipByUserId,
		memberIdsToValidate: [...memberIdsToValidate],
	};
}

function readPatchString(value: unknown, attribute: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `${attribute} must be a non-empty string`,
			scimType: "invalidValue",
		});
	}
	return value.trim();
}

function applyGroupPatch(
	group: SCIMGroup,
	currentMemberIds: string[],
	operations: z.infer<typeof patchSCIMGroupBodySchema>["Operations"],
): {
	displayName: string;
	externalId: string | undefined;
	memberIds: string[];
} {
	const memberIds = new Set(currentMemberIds);
	let displayName = group.displayName;
	let externalId = group.externalId ?? undefined;

	function applyAttribute(
		op: "add" | "remove" | "replace",
		path: string,
		value: unknown,
	): void {
		const normalizedPath = normalizeGroupPatchPath(path).toLowerCase();
		if (
			normalizedPath === "id" ||
			normalizedPath === "schemas" ||
			normalizedPath === "meta" ||
			normalizedPath.startsWith("meta.")
		) {
			throw createSCIMError("BAD_REQUEST", {
				detail: `${path} is read-only`,
				scimType: "mutability",
			});
		}
		if (normalizedPath === "displayname") {
			if (op === "remove") {
				throw createSCIMError("BAD_REQUEST", {
					detail: "displayName is required and cannot be removed",
					scimType: "mutability",
				});
			}
			displayName = readPatchString(value, "displayName");
			return;
		}
		if (normalizedPath === "externalid") {
			externalId =
				op === "remove" ? undefined : readPatchString(value, "externalId");
			return;
		}

		throw createSCIMError("BAD_REQUEST", {
			detail: "Unsupported Group PATCH path",
			scimType: "invalidPath",
		});
	}

	for (const operation of operations) {
		const path = operation.path?.trim();
		if (!path) {
			if (operation.op === "remove") {
				throw createSCIMError("BAD_REQUEST", {
					detail: "A pathless remove operation has no target",
					scimType: "noTarget",
				});
			}
			if (!isRecord(operation.value)) {
				throw createSCIMError("BAD_REQUEST", {
					detail: "A pathless Group PATCH value must be an object",
					scimType: "invalidValue",
				});
			}
			for (const [attribute, value] of Object.entries(operation.value)) {
				const normalizedAttribute = attribute.toLowerCase();
				if (normalizedAttribute === "id") {
					if (value !== group.id) {
						throw createSCIMError("BAD_REQUEST", {
							detail: "A Group PATCH cannot change id",
							scimType: "mutability",
						});
					}
					continue;
				}
				if (
					normalizedAttribute === "schemas" ||
					normalizedAttribute === "meta"
				) {
					continue;
				}
				if (normalizedAttribute === "members") {
					const patchMemberIds = readPatchMemberIds(value);
					if (operation.op === "replace") memberIds.clear();
					for (const memberId of patchMemberIds) memberIds.add(memberId);
					continue;
				}
				applyAttribute(operation.op, attribute, value);
			}
			continue;
		}
		if (normalizeGroupPatchPath(path).toLowerCase() === "members") {
			if (operation.op === "add") {
				for (const memberId of readPatchMemberIds(operation.value)) {
					memberIds.add(memberId);
				}
				continue;
			}
			if (operation.op === "replace") {
				memberIds.clear();
				for (const memberId of readPatchMemberIds(operation.value)) {
					memberIds.add(memberId);
				}
				continue;
			}
			if (operation.value === undefined) {
				memberIds.clear();
				continue;
			}
			for (const memberId of readPatchMemberIds(operation.value)) {
				memberIds.delete(memberId);
			}
			continue;
		}

		const valuePathMemberId = path
			? readMemberIdFromValuePath(path)
			: undefined;
		if (operation.op === "remove" && valuePathMemberId) {
			memberIds.delete(valuePathMemberId);
			continue;
		}

		applyAttribute(operation.op, path, operation.value);
	}
	assertGroupMemberCount(memberIds.size);
	return { displayName, externalId, memberIds: [...memberIds] };
}

async function assertConnectionOwnsUsers(
	adapter: Pick<DBAdapter, "findMany">,
	connectionId: string,
	scimUserIds: string[],
): Promise<void> {
	if (scimUserIds.length === 0) return;
	const scimUsers = await adapter.findMany<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: connectionId },
			{ field: "id", value: scimUserIds, operator: "in" },
		],
	});
	if (scimUsers.length !== scimUserIds.length) {
		throw createSCIMError("BAD_REQUEST", {
			detail: "One or more Group members are invalid",
			scimType: "invalidValue",
		});
	}
}

type GroupMembershipAdapter = Pick<
	DBAdapter,
	"count" | "create" | "deleteMany" | "findMany"
>;

async function applyIncrementalGroupMembershipPatch(
	adapter: GroupMembershipAdapter,
	input: {
		connectionId: string;
		groupId: string;
		patch: IncrementalMembershipPatch;
		createdAt: Date;
	},
) {
	await assertConnectionOwnsUsers(adapter, input.connectionId, [
		...input.patch.memberIdsToValidate,
	]);
	const targetedUserIds = [...input.patch.desiredMembershipByUserId.keys()];
	if (targetedUserIds.length === 0) {
		return {
			addedMemberships: [] as SCIMGroupMember[],
			removedMemberships: [] as SCIMGroupMember[],
		};
	}
	const existingMemberships = await adapter.findMany<SCIMGroupMember>({
		model: "scimGroupMember",
		where: [
			{ field: "connectionId", value: input.connectionId },
			{ field: "groupId", value: input.groupId },
			{ field: "scimUserId", value: targetedUserIds, operator: "in" },
		],
	});
	const existingByUserId = new Map(
		existingMemberships.map((membership) => [
			membership.scimUserId,
			membership,
		]),
	);
	const removedMemberships = existingMemberships.filter(
		(membership) =>
			input.patch.desiredMembershipByUserId.get(membership.scimUserId) ===
			false,
	);
	const addedSCIMUserIds = [...input.patch.desiredMembershipByUserId]
		.filter(
			([scimUserId, desired]) => desired && !existingByUserId.has(scimUserId),
		)
		.map(([scimUserId]) => scimUserId);
	const existingMemberCount = await adapter.count({
		model: "scimGroupMember",
		where: [
			{ field: "connectionId", value: input.connectionId },
			{ field: "groupId", value: input.groupId },
		],
	});
	assertGroupMemberCount(
		existingMemberCount + addedSCIMUserIds.length - removedMemberships.length,
	);
	if (removedMemberships.length > 0) {
		await adapter.deleteMany({
			model: "scimGroupMember",
			where: [
				{ field: "connectionId", value: input.connectionId },
				{ field: "groupId", value: input.groupId },
				{
					field: "scimUserId",
					value: removedMemberships.map((membership) => membership.scimUserId),
					operator: "in",
				},
			],
		});
	}

	const addedMemberships: SCIMGroupMember[] = [];
	for (const scimUserId of addedSCIMUserIds) {
		const membership = await adapter.create<
			Omit<SCIMGroupMember, "id">,
			SCIMGroupMember
		>({
			model: "scimGroupMember",
			data: {
				connectionId: input.connectionId,
				groupId: input.groupId,
				scimUserId,
				membershipKey: createGroupMembershipKey(
					input.connectionId,
					input.groupId,
					scimUserId,
				),
				createdAt: input.createdAt,
			},
		});
		addedMemberships.push(membership);
	}

	return { addedMemberships, removedMemberships };
}

async function replaceGroupMemberships(
	adapter: GroupMembershipAdapter,
	input: {
		connectionId: string;
		groupId: string;
		scimUserIds: string[];
		createdAt: Date;
		existingMemberships?: readonly SCIMGroupMember[];
	},
) {
	await assertConnectionOwnsUsers(
		adapter,
		input.connectionId,
		input.scimUserIds,
	);
	const existingMemberships =
		input.existingMemberships ??
		(await adapter.findMany<SCIMGroupMember>({
			model: "scimGroupMember",
			where: [
				{ field: "connectionId", value: input.connectionId },
				{ field: "groupId", value: input.groupId },
			],
		}));
	const existingMemberIds = new Set(
		existingMemberships.map((membership) => membership.scimUserId),
	);
	const requestedMemberIds = new Set(input.scimUserIds);
	const removedMemberships = existingMemberships.filter(
		(membership) => !requestedMemberIds.has(membership.scimUserId),
	);
	if (removedMemberships.length > 0) {
		await adapter.deleteMany({
			model: "scimGroupMember",
			where: [
				{ field: "connectionId", value: input.connectionId },
				{ field: "groupId", value: input.groupId },
				{
					field: "scimUserId",
					value: removedMemberships.map((membership) => membership.scimUserId),
					operator: "in",
				},
			],
		});
	}

	const addedMemberships: SCIMGroupMember[] = [];
	for (const scimUserId of input.scimUserIds) {
		if (existingMemberIds.has(scimUserId)) continue;
		const membership = await adapter.create<
			Omit<SCIMGroupMember, "id">,
			SCIMGroupMember
		>({
			model: "scimGroupMember",
			data: {
				connectionId: input.connectionId,
				groupId: input.groupId,
				scimUserId,
				membershipKey: createGroupMembershipKey(
					input.connectionId,
					input.groupId,
					scimUserId,
				),
				createdAt: input.createdAt,
			},
		});
		addedMemberships.push(membership);
	}

	return { addedMemberships, removedMemberships };
}

function createGroupResourceBase(baseURL: string, group: SCIMGroup) {
	return {
		schemas: [SCIM_GROUP_SCHEMA],
		id: group.id,
		...(group.externalId ? { externalId: group.externalId } : {}),
		displayName: group.displayName,
		meta: {
			resourceType: "Group",
			created: group.createdAt,
			lastModified: group.updatedAt,
			location: getResourceURL(
				`/scim/v2/Groups/${encodeURIComponent(group.id)}`,
				baseURL,
			),
		},
	};
}

function createGroupResourceFromMemberships(
	baseURL: string,
	group: SCIMGroup,
	memberships: readonly SCIMGroupMember[],
	scimUserById: ReadonlyMap<string, SCIMUser>,
) {
	if (memberships.length > SCIM_MAX_GROUP_MEMBERS) {
		throw createSCIMError("INTERNAL_SERVER_ERROR", {
			detail: "Persisted SCIM Group membership exceeds the server limit",
		});
	}
	const members = memberships.flatMap((membership) => {
		const scimUser = scimUserById.get(membership.scimUserId);
		return scimUser
			? [
					{
						value: scimUser.id,
						$ref: getResourceURL(
							`/scim/v2/Users/${encodeURIComponent(scimUser.id)}`,
							baseURL,
						),
						display: scimUser.displayName,
						type: "User" as const,
					},
				]
			: [];
	});

	return {
		...createGroupResourceBase(baseURL, group),
		members,
	};
}

async function findSCIMUsersForMemberships(
	adapter: Pick<DBAdapter, "findMany">,
	connectionId: string,
	memberships: readonly SCIMGroupMember[],
): Promise<Map<string, SCIMUser>> {
	const scimUserIds = [
		...new Set(memberships.map((membership) => membership.scimUserId)),
	];
	const scimUsers: SCIMUser[] = [];
	for (
		let offset = 0;
		offset < scimUserIds.length;
		offset += SCIM_USER_ID_QUERY_CHUNK_SIZE
	) {
		const chunk = scimUserIds.slice(
			offset,
			offset + SCIM_USER_ID_QUERY_CHUNK_SIZE,
		);
		scimUsers.push(
			...(await adapter.findMany<SCIMUser>({
				model: "scimUser",
				where: [
					{ field: "connectionId", value: connectionId },
					{ field: "id", value: chunk, operator: "in" },
				],
				limit: chunk.length,
			})),
		);
	}
	return new Map(scimUsers.map((scimUser) => [scimUser.id, scimUser]));
}

async function createGroupResource(
	adapter: Pick<DBAdapter, "findMany">,
	baseURL: string,
	group: SCIMGroup,
) {
	const memberships = await adapter.findMany<SCIMGroupMember>({
		model: "scimGroupMember",
		where: [
			{ field: "connectionId", value: group.connectionId },
			{ field: "groupId", value: group.id },
		],
		limit: SCIM_MAX_GROUP_MEMBERS + 1,
		sortBy: { field: "createdAt", direction: "asc" },
	});
	if (memberships.length > SCIM_MAX_GROUP_MEMBERS) {
		throw createSCIMError("INTERNAL_SERVER_ERROR", {
			detail: "Persisted SCIM Group membership exceeds the server limit",
		});
	}
	const scimUserById = await findSCIMUsersForMemberships(
		adapter,
		group.connectionId,
		memberships,
	);
	return createGroupResourceFromMemberships(
		baseURL,
		group,
		memberships,
		scimUserById,
	);
}

function projectionRequestsGroupMembers(
	projection: SCIMAttributeProjection,
): boolean {
	if (projection.mode === "default") return true;
	if (projection.mode === "exclude") {
		return !projection.excludedAttributes.has("members");
	}
	return [...projection.attributes].some(
		(attribute) => attribute === "members" || attribute.startsWith("members."),
	);
}

async function createProjectedGroupResource(
	adapter: Pick<DBAdapter, "findMany">,
	baseURL: string,
	group: SCIMGroup,
	projection: SCIMAttributeProjection,
) {
	const resource = projectionRequestsGroupMembers(projection)
		? await createGroupResource(adapter, baseURL, group)
		: { ...createGroupResourceBase(baseURL, group), members: [] };
	return projectSCIMResourceAttributes(resource, projection);
}

async function createProjectedGroupResources(
	adapter: Pick<DBAdapter, "findMany">,
	baseURL: string,
	groups: readonly SCIMGroup[],
	projection: SCIMAttributeProjection,
) {
	if (!projectionRequestsGroupMembers(projection)) {
		return groups.map((group) =>
			projectSCIMResourceAttributes(
				{ ...createGroupResourceBase(baseURL, group), members: [] },
				projection,
			),
		);
	}
	const [firstGroup] = groups;
	if (!firstGroup) return [];

	const maximumMembershipRows = groups.length * SCIM_MAX_GROUP_MEMBERS;
	const memberships = await adapter.findMany<SCIMGroupMember>({
		model: "scimGroupMember",
		where: [
			{ field: "connectionId", value: firstGroup.connectionId },
			{
				field: "groupId",
				value: groups.map((group) => group.id),
				operator: "in",
			},
		],
		limit: maximumMembershipRows + 1,
		sortBy: { field: "createdAt", direction: "asc" },
	});
	if (memberships.length > maximumMembershipRows) {
		throw createSCIMError("INTERNAL_SERVER_ERROR", {
			detail: "Persisted SCIM Group membership exceeds the server limit",
		});
	}
	const membershipsByGroupId = new Map<string, SCIMGroupMember[]>();
	for (const membership of memberships) {
		const groupMemberships = membershipsByGroupId.get(membership.groupId) ?? [];
		groupMemberships.push(membership);
		membershipsByGroupId.set(membership.groupId, groupMemberships);
	}
	for (const groupMemberships of membershipsByGroupId.values()) {
		if (groupMemberships.length > SCIM_MAX_GROUP_MEMBERS) {
			throw createSCIMError("INTERNAL_SERVER_ERROR", {
				detail: "Persisted SCIM Group membership exceeds the server limit",
			});
		}
	}
	const scimUserById = await findSCIMUsersForMemberships(
		adapter,
		firstGroup.connectionId,
		memberships,
	);

	return groups.map((group) =>
		projectSCIMResourceAttributes(
			createGroupResourceFromMemberships(
				baseURL,
				group,
				membershipsByGroupId.get(group.id) ?? [],
				scimUserById,
			),
			projection,
		),
	);
}

export function createSCIMGroup(
	authMiddleware: SCIMConnectionMiddleware,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Groups",
		{
			method: "POST",
			body: APIGroupSchema,
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Create SCIM Group",
					responses: {
						"201": {
							description: "SCIM Group resource",
							content: createSCIMOpenAPIContent(OpenAPIGroupResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const connection = ctx.context.scimConnection;
			const attributeProjection = requireGroupAttributeProjection(
				ctx.query ?? {},
			);
			await assertGroupConnectionDomainStable(adapter, connection);
			const displayName = ctx.body.displayName.trim();
			if (!displayName) {
				throw createSCIMError("BAD_REQUEST", {
					detail: "displayName cannot be empty",
					scimType: "invalidValue",
				});
			}
			const scimUserIds = normalizeGroupMemberIds(ctx.body.members ?? []);
			assertGroupMemberCount(scimUserIds.length);
			const externalIdKey = createGroupExternalIdKey(
				connection.id,
				ctx.body.externalId,
			);
			const displayNameKey = createGroupDisplayNameKey(
				connection.id,
				displayName,
			);
			await assertDisplayNameAvailable(adapter, connection.id, displayNameKey);
			await assertExternalIdAvailable(adapter, connection.id, externalIdKey);
			const group = await runSCIMCreateWithUniquenessCheck(
				() =>
					runGroupMutationTransaction(adapter, async (trx) => {
						await assertDisplayNameAvailable(
							trx,
							connection.id,
							displayNameKey,
						);
						await assertExternalIdAvailable(trx, connection.id, externalIdKey);
						const now = new Date();
						const createdGroup = await trx.create<
							Omit<SCIMGroup, "id">,
							SCIMGroup
						>({
							model: "scimGroup",
							data: {
								connectionId: connection.id,
								provisioningDomainId: connection.provisioningDomainId,
								revision: 0,
								displayName,
								displayNameKey,
								externalId: ctx.body.externalId,
								externalIdKey,
								orderKey: createSCIMOrderKey(now),
								createdAt: now,
								updatedAt: now,
							},
						});
						await projection.acquireUserLocks({
							database: trx,
							provisioningDomainId: connection.provisioningDomainId,
							scimUserIds,
						});
						await replaceGroupMemberships(trx, {
							connectionId: connection.id,
							groupId: createdGroup.id,
							scimUserIds,
							createdAt: now,
						});
						await projection.reconcileUsers({
							database: trx,
							auth: ctx.context,
							provisioningDomainId: connection.provisioningDomainId,
							scimUserIds,
							subjectLocksAcquired: true,
						});
						await fenceActiveSCIMConnection(trx, connection.id);
						return createdGroup;
					}),
				async () => {
					await assertDisplayNameAvailable(
						adapter,
						connection.id,
						displayNameKey,
					);
					await assertExternalIdAvailable(
						adapter,
						connection.id,
						externalIdKey,
					);
				},
			);

			const completeResource = createGroupResourceBase(
				ctx.context.baseURL,
				group,
			);
			const resource = await createProjectedGroupResource(
				adapter,
				ctx.context.baseURL,
				group,
				attributeProjection,
			);
			ctx.setStatus(201);
			ctx.setHeader("location", completeResource.meta.location);
			ctx.setHeader("content-location", completeResource.meta.location);
			return ctx.json(resource);
		},
	);
}

export function getSCIMGroup(authMiddleware: SCIMConnectionMiddleware) {
	return createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "GET",
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Get SCIM Group",
					responses: {
						"200": {
							description: "SCIM Group resource",
							content: createSCIMOpenAPIContent(OpenAPIGroupResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const group = await findSCIMGroup(
				adapter,
				ctx.context.scimConnection,
				ctx.params.groupId,
			);
			if (!group) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM Group not found",
				});
			}

			const attributeProjection = parseSCIMAttributeProjection(
				"Group",
				ctx.query ?? {},
			);
			if (!attributeProjection.ok) {
				throw createSCIMError("BAD_REQUEST", {
					detail: attributeProjection.error.detail,
					scimType: attributeProjection.error.scimType,
				});
			}
			const resource = await createProjectedGroupResource(
				adapter,
				ctx.context.baseURL,
				group,
				attributeProjection.value,
			);

			return ctx.json(resource);
		},
	);
}

export function listSCIMGroups(authMiddleware: SCIMConnectionMiddleware) {
	return createAuthEndpoint(
		"/scim/v2/Groups",
		{
			method: "GET",
			query: scimCollectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "List SCIM Groups",
					responses: {
						"200": {
							description: "SCIM Group list",
							content: createSCIMOpenAPIContent({
								type: "object",
								properties: {
									totalResults: { type: "number" },
									itemsPerPage: { type: "number" },
									startIndex: { type: "number" },
									Resources: {
										type: "array",
										items: OpenAPIGroupResourceSchema,
									},
								},
							}),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			await assertGroupConnectionDomainStable(
				adapter,
				ctx.context.scimConnection,
			);
			const parsedQuery = parseSCIMCollectionQuery("Group", ctx.query ?? {});
			if (!parsedQuery.ok) {
				throw createSCIMError("BAD_REQUEST", {
					detail: parsedQuery.error.detail,
					scimType: parsedQuery.error.scimType,
				});
			}
			const {
				filters,
				pagination,
				projection: attributeProjection,
			} = parsedQuery.value;
			const where = createGroupCollectionWhere(
				ctx.context.scimConnection.id,
				filters,
			);
			const totalResults = await adapter.count({
				model: "scimGroup",
				where,
			});
			const groups =
				pagination.count === 0
					? []
					: await adapter.findMany<SCIMGroup>({
							model: "scimGroup",
							where,
							limit: pagination.count,
							offset: pagination.offset,
							sortBy: { field: "orderKey", direction: "asc" },
						});
			const resources = await createProjectedGroupResources(
				adapter,
				ctx.context.baseURL,
				groups,
				attributeProjection,
			);

			return ctx.json({
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				totalResults,
				startIndex: pagination.startIndex,
				itemsPerPage: resources.length,
				Resources: resources,
			});
		},
	);
}

export function replaceSCIMGroup(
	authMiddleware: SCIMConnectionMiddleware,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "PUT",
			body: APIGroupSchema,
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Replace SCIM Group",
					responses: {
						"200": {
							description: "SCIM Group resource",
							content: createSCIMOpenAPIContent(OpenAPIGroupResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const connection = ctx.context.scimConnection;
			const attributeProjection = requireGroupAttributeProjection(
				ctx.query ?? {},
			);
			const group = await findSCIMGroup(
				adapter,
				connection,
				ctx.params.groupId,
			);
			if (!group) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM Group not found",
				});
			}

			const displayName = ctx.body.displayName.trim();
			if (!displayName) {
				throw createSCIMError("BAD_REQUEST", {
					detail: "displayName cannot be empty",
					scimType: "invalidValue",
				});
			}
			const scimUserIds = normalizeGroupMemberIds(ctx.body.members ?? []);
			assertGroupMemberCount(scimUserIds.length);
			const externalIdKey = createGroupExternalIdKey(
				connection.id,
				ctx.body.externalId,
			);
			const displayNameKey = createGroupDisplayNameKey(
				connection.id,
				displayName,
			);
			await assertDisplayNameAvailable(
				adapter,
				connection.id,
				displayNameKey,
				group.id,
			);
			await assertExternalIdAvailable(
				adapter,
				connection.id,
				externalIdKey,
				group.id,
			);
			const updatedGroup = await runGroupMutationTransaction(
				adapter,
				async (trx) => {
					const currentGroup = await acquireSCIMGroupMutationLock(
						trx,
						connection,
						group.id,
					);
					const updatedAt = new Date();
					await assertDisplayNameAvailable(
						trx,
						connection.id,
						displayNameKey,
						currentGroup.id,
					);
					await assertExternalIdAvailable(
						trx,
						connection.id,
						externalIdKey,
						currentGroup.id,
					);
					const currentMemberships = await trx.findMany<SCIMGroupMember>({
						model: "scimGroupMember",
						where: [
							{ field: "connectionId", value: connection.id },
							{ field: "groupId", value: currentGroup.id },
						],
					});
					await projection.acquireUserLocks({
						database: trx,
						provisioningDomainId: connection.provisioningDomainId,
						scimUserIds: [
							...new Set([
								...scimUserIds,
								...currentMemberships.map(
									(membership) => membership.scimUserId,
								),
							]),
						],
					});
					const membershipDelta = await replaceGroupMemberships(trx, {
						connectionId: connection.id,
						groupId: currentGroup.id,
						scimUserIds,
						createdAt: updatedAt,
						existingMemberships: currentMemberships,
					});

					const updated = await trx.update<SCIMGroup>({
						model: "scimGroup",
						where: [
							{ field: "id", value: currentGroup.id },
							{ field: "connectionId", value: connection.id },
						],
						update: {
							displayName,
							displayNameKey,
							externalId: ctx.body.externalId ?? null,
							externalIdKey: externalIdKey ?? null,
							updatedAt,
						},
					});
					if (!updated) {
						throw createSCIMError("NOT_FOUND", {
							detail: "SCIM Group not found",
						});
					}
					const affectedSCIMUserIds = new Set([
						...scimUserIds,
						...membershipDelta.removedMemberships.map(
							(membership) => membership.scimUserId,
						),
					]);
					await projection.reconcileUsers({
						database: trx,
						auth: ctx.context,
						provisioningDomainId: connection.provisioningDomainId,
						scimUserIds: [...affectedSCIMUserIds],
						subjectLocksAcquired: true,
					});
					await fenceActiveSCIMConnection(trx, connection.id);
					return updated;
				},
			);

			const completeResource = createGroupResourceBase(
				ctx.context.baseURL,
				updatedGroup,
			);
			const resource = await createProjectedGroupResource(
				adapter,
				ctx.context.baseURL,
				updatedGroup,
				attributeProjection,
			);
			ctx.setHeader("location", completeResource.meta.location);
			return ctx.json(resource);
		},
	);
}

export function patchSCIMGroup(
	authMiddleware: SCIMConnectionMiddleware,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "PATCH",
			body: patchSCIMGroupBodySchema,
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Patch SCIM Group",
					responses: {
						"200": {
							description: "Projected SCIM Group resource",
							content: createSCIMOpenAPIContent(OpenAPIGroupResourceSchema),
						},
						"204": {
							description: "SCIM Group updated",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const connection = ctx.context.scimConnection;
			const query = ctx.query ?? {};
			const attributeProjection = requireGroupAttributeProjection(query);
			const returnProjectedResource = requestsProjectedMutationResponse(query);
			const group = await findSCIMGroup(
				adapter,
				connection,
				ctx.params.groupId,
			);
			if (!group) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM Group not found",
				});
			}

			const incrementalPatch = parseIncrementalMembershipPatch(
				ctx.body.Operations,
			);
			const updatedGroup = await runGroupMutationTransaction(
				adapter,
				async (trx) => {
					const currentGroup = await acquireSCIMGroupMutationLock(
						trx,
						connection,
						group.id,
					);
					const updatedAt = new Date();
					let affectedSCIMUserIds: Set<string>;
					let resourceChanged: boolean;
					let update: Partial<
						Pick<
							SCIMGroup,
							| "displayName"
							| "displayNameKey"
							| "externalId"
							| "externalIdKey"
							| "updatedAt"
						>
					> = { updatedAt };

					if (incrementalPatch) {
						await projection.acquireUserLocks({
							database: trx,
							provisioningDomainId: connection.provisioningDomainId,
							scimUserIds: [
								...incrementalPatch.desiredMembershipByUserId.keys(),
							],
						});
						const membershipDelta = await applyIncrementalGroupMembershipPatch(
							trx,
							{
								connectionId: connection.id,
								groupId: currentGroup.id,
								patch: incrementalPatch,
								createdAt: updatedAt,
							},
						);
						affectedSCIMUserIds = new Set([
							...membershipDelta.addedMemberships.map(
								(membership) => membership.scimUserId,
							),
							...membershipDelta.removedMemberships.map(
								(membership) => membership.scimUserId,
							),
						]);
						resourceChanged = affectedSCIMUserIds.size > 0;
					} else {
						const currentMemberships = await trx.findMany<SCIMGroupMember>({
							model: "scimGroupMember",
							where: [
								{ field: "connectionId", value: connection.id },
								{ field: "groupId", value: currentGroup.id },
							],
						});
						const patch = applyGroupPatch(
							currentGroup,
							currentMemberships.map((membership) => membership.scimUserId),
							ctx.body.Operations,
						);
						await projection.acquireUserLocks({
							database: trx,
							provisioningDomainId: connection.provisioningDomainId,
							scimUserIds: [
								...new Set([
									...patch.memberIds,
									...currentMemberships.map(
										(membership) => membership.scimUserId,
									),
								]),
							],
						});
						const externalIdKey = createGroupExternalIdKey(
							connection.id,
							patch.externalId,
						);
						const displayNameKey = createGroupDisplayNameKey(
							connection.id,
							patch.displayName,
						);
						await assertDisplayNameAvailable(
							trx,
							connection.id,
							displayNameKey,
							currentGroup.id,
						);
						await assertExternalIdAvailable(
							trx,
							connection.id,
							externalIdKey,
							currentGroup.id,
						);
						const membershipDelta = await replaceGroupMemberships(trx, {
							connectionId: connection.id,
							groupId: currentGroup.id,
							scimUserIds: patch.memberIds,
							createdAt: updatedAt,
							existingMemberships: currentMemberships,
						});
						const metadataChanged =
							patch.displayName !== currentGroup.displayName ||
							patch.externalId !== (currentGroup.externalId ?? undefined);
						affectedSCIMUserIds = new Set([
							...(metadataChanged ? patch.memberIds : []),
							...membershipDelta.addedMemberships.map(
								(membership) => membership.scimUserId,
							),
							...membershipDelta.removedMemberships.map(
								(membership) => membership.scimUserId,
							),
						]);
						resourceChanged = metadataChanged || affectedSCIMUserIds.size > 0;
						update = {
							displayName: patch.displayName,
							displayNameKey,
							externalId: patch.externalId ?? null,
							externalIdKey: externalIdKey ?? null,
							updatedAt,
						};
					}
					let mutationResult = currentGroup;
					if (resourceChanged) {
						const updated = await trx.update<SCIMGroup>({
							model: "scimGroup",
							where: [
								{ field: "id", value: currentGroup.id },
								{ field: "connectionId", value: connection.id },
							],
							update,
						});
						if (!updated) {
							throw createSCIMError("NOT_FOUND", {
								detail: "SCIM Group not found",
							});
						}
						await projection.reconcileUsers({
							database: trx,
							auth: ctx.context,
							provisioningDomainId: connection.provisioningDomainId,
							scimUserIds: [...affectedSCIMUserIds],
							subjectLocksAcquired: true,
						});
						mutationResult = updated;
					}
					await fenceActiveSCIMConnection(trx, connection.id);
					return mutationResult;
				},
			);

			const completeResource = createGroupResourceBase(
				ctx.context.baseURL,
				updatedGroup,
			);
			ctx.setHeader("location", completeResource.meta.location);
			if (!returnProjectedResource) {
				ctx.setStatus(204);
				return;
			}
			return ctx.json(
				await createProjectedGroupResource(
					adapter,
					ctx.context.baseURL,
					updatedGroup,
					attributeProjection,
				),
			);
		},
	);
}

export function deleteSCIMGroup(
	authMiddleware: SCIMConnectionMiddleware,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "DELETE",
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Delete SCIM Group",
					responses: {
						"204": {
							description: "SCIM Group deleted",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const connection = ctx.context.scimConnection;
			const group = await findSCIMGroup(
				adapter,
				connection,
				ctx.params.groupId,
			);
			if (!group) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM Group not found",
				});
			}

			await runGroupMutationTransaction(adapter, async (trx) => {
				const currentGroup = await acquireSCIMGroupMutationLock(
					trx,
					connection,
					group.id,
				);
				const memberships = await trx.findMany<SCIMGroupMember>({
					model: "scimGroupMember",
					where: [
						{ field: "connectionId", value: connection.id },
						{ field: "groupId", value: currentGroup.id },
					],
				});
				await projection.acquireUserLocks({
					database: trx,
					provisioningDomainId: connection.provisioningDomainId,
					scimUserIds: memberships.map((membership) => membership.scimUserId),
				});
				await trx.deleteMany({
					model: "scimGroupMember",
					where: [
						{ field: "connectionId", value: connection.id },
						{ field: "groupId", value: currentGroup.id },
					],
				});
				await trx.delete<SCIMGroup>({
					model: "scimGroup",
					where: [
						{ field: "id", value: currentGroup.id },
						{ field: "connectionId", value: connection.id },
					],
				});
				await projection.reconcileUsers({
					database: trx,
					auth: ctx.context,
					provisioningDomainId: connection.provisioningDomainId,
					scimUserIds: memberships.map((membership) => membership.scimUserId),
					subjectLocksAcquired: true,
				});
				await fenceActiveSCIMConnection(trx, connection.id);
			});

			ctx.setStatus(204);
			return;
		},
	);
}
