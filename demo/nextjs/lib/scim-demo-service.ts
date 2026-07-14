import type { DBAdapter } from "better-auth";
import {
	getSCIMDemoToken,
	SCIM_DEMO_CONNECTION_ID,
	SCIM_DEMO_EXTERNAL_ID_PREFIX,
} from "./scim-demo.ts";
import type { SCIMDemoGroupKey, SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import {
	SCIM_DEMO_DIRECTORY_GROUPS,
	SCIM_DEMO_DIRECTORY_USERS,
	SCIM_DEMO_ROLE,
} from "./scim-demo-catalog.ts";
import type {
	SCIMDemoAccessDecision,
	SCIMDemoAction,
	SCIMDemoActionResult,
	SCIMDemoApplicationAccess,
	SCIMDemoConnectionState,
	SCIMDemoGroupState,
	SCIMDemoOperation,
	SCIMDemoUserLifecycle,
	SCIMDemoUserState,
	SCIMDemoWorkspace,
} from "./scim-demo-types.ts";

const SCIM_BASE_PATH = "/api/auth/scim/v2";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_REQUEST_TIMEOUT_MS = 5_000;

type SCIMDemoUserDefinition = (typeof SCIM_DEMO_DIRECTORY_USERS)[number];
type SCIMDemoGroupDefinition = (typeof SCIM_DEMO_DIRECTORY_GROUPS)[number];

interface SCIMUserRow {
	active: boolean;
	connectionId: string;
	displayName: string;
	externalId?: string | null;
	id: string;
	updatedAt: Date;
	userId: string;
	userName: string;
}

interface SCIMGroupRow {
	connectionId: string;
	displayName: string;
	externalId?: string | null;
	id: string;
	updatedAt: Date;
}

interface SCIMGroupMemberRow {
	connectionId: string;
	groupId: string;
	scimUserId: string;
}

interface SCIMIdentityTombstoneRow {
	connectionId: string;
	deletedAt: Date;
	externalId: string;
	id: string;
	userId: string;
}

interface SCIMDemoApplicationUserRow {
	email: string;
	id: string;
	name: string;
	scimDemoActive?: boolean | null;
	scimDemoRole?: string | null;
}

interface SCIMUserResource {
	active: boolean;
	displayName: string;
	externalId?: string;
	id: string;
	userName: string;
}

interface SCIMGroupResource {
	externalId?: string;
	id: string;
	members: Array<{ value: string }>;
}

interface SCIMResponse {
	body: unknown;
	status: number;
}

interface SCIMRequestOptions {
	authenticated?: boolean;
	body?: unknown;
	expectedStatus: number | readonly number[];
	method?: SCIMDemoOperation["method"] | "GET";
}

interface SCIMDemoServiceContext {
	baseURL: string;
	database: Pick<DBAdapter, "deleteMany" | "findMany" | "findOne">;
	operatorId: string;
}

interface SCIMDemoActionContext extends SCIMDemoServiceContext {
	database: Pick<DBAdapter, "deleteMany" | "findMany" | "findOne">;
}

type SCIMDemoRequestError = Error & {
	operations?: SCIMDemoOperation[];
	status?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, resource: string) {
	if (!isRecord(value)) {
		throw new Error(`${resource} returned an invalid response`);
	}
	return value;
}

function requireString(value: unknown, field: string) {
	if (typeof value !== "string" || !value) {
		throw new Error(`SCIM response is missing ${field}`);
	}
	return value;
}

function requireBoolean(value: unknown, field: string) {
	if (typeof value !== "boolean") {
		throw new Error(`SCIM response is missing ${field}`);
	}
	return value;
}

function readSCIMUser(value: unknown): SCIMUserResource {
	const resource = requireRecord(value, "SCIM User");
	return {
		id: requireString(resource.id, "User.id"),
		...(typeof resource.externalId === "string"
			? { externalId: resource.externalId }
			: {}),
		userName: requireString(resource.userName, "User.userName"),
		displayName: requireString(resource.displayName, "User.displayName"),
		active: requireBoolean(resource.active, "User.active"),
	};
}

function readSCIMGroup(value: unknown): SCIMGroupResource {
	const resource = requireRecord(value, "SCIM Group");
	if (!Array.isArray(resource.members)) {
		throw new Error("SCIM response is missing Group.members");
	}
	return {
		id: requireString(resource.id, "Group.id"),
		...(typeof resource.externalId === "string"
			? { externalId: resource.externalId }
			: {}),
		members: resource.members.map((member) => ({
			value: requireString(
				requireRecord(member, "SCIM Group member").value,
				"Group.members.value",
			),
		})),
	};
}

function readSCIMErrorDetail(body: unknown) {
	if (isRecord(body)) {
		if (typeof body.detail === "string") return body.detail;
		if (typeof body.message === "string") return body.message;
		if (typeof body.error === "string") return body.error;
	}
	return undefined;
}

function createRequestError(message: string, status?: number) {
	const error = new Error(message) as SCIMDemoRequestError;
	if (status !== undefined) error.status = status;
	return error;
}

function createActionError(message: string, status: number) {
	return createRequestError(message, status);
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "The SCIM operation failed";
}

export function getSCIMDemoError(error: unknown) {
	if (
		error instanceof Error &&
		"status" in error &&
		typeof error.status === "number"
	) {
		return { message: error.message, status: error.status };
	}
	return { message: getErrorMessage(error), status: 500 };
}

export function getSCIMDemoCompletedOperations(error: unknown) {
	if (
		error instanceof Error &&
		"operations" in error &&
		Array.isArray(error.operations)
	) {
		return error.operations.filter(
			(operation): operation is SCIMDemoOperation =>
				isRecord(operation) &&
				typeof operation.id === "string" &&
				typeof operation.effect === "string",
		);
	}
	return [];
}

function assertState(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function requestSCIM(
	baseURL: string,
	path: string,
	options: SCIMRequestOptions,
): Promise<SCIMResponse> {
	const headers = new Headers({ accept: SCIM_MEDIA_TYPE });
	if (options.authenticated !== false) {
		headers.set("authorization", `Bearer ${getSCIMDemoToken()}`);
	}
	if (options.body !== undefined) {
		headers.set("content-type", SCIM_MEDIA_TYPE);
	}

	let response: Response;
	try {
		response = await fetch(new URL(`${SCIM_BASE_PATH}${path}`, baseURL), {
			method: options.method ?? "GET",
			headers,
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
			cache: "no-store",
			redirect: "error",
			signal: AbortSignal.timeout(SCIM_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "TimeoutError" || error.name === "AbortError")
		) {
			throw createRequestError(
				"The SCIM endpoint did not respond within 5 seconds",
				504,
			);
		}
		throw error;
	}
	const responseText = response.status === 204 ? "" : await response.text();
	let body: unknown;
	if (responseText) {
		try {
			body = JSON.parse(responseText);
		} catch {
			body = undefined;
		}
	}
	const expectedStatuses = Array.isArray(options.expectedStatus)
		? options.expectedStatus
		: [options.expectedStatus];
	if (!expectedStatuses.includes(response.status)) {
		throw createRequestError(
			readSCIMErrorDetail(body) ||
				responseText.trim().slice(0, 200) ||
				`SCIM request returned status ${response.status}`,
			response.status,
		);
	}
	return { body, status: response.status };
}

function serializeBody(value: unknown) {
	return value === undefined ? null : JSON.stringify(value, null, 2);
}

function createOperation(input: {
	effect: string;
	method: SCIMDemoOperation["method"];
	requestBody?: unknown;
	resource: string;
	responseBody?: unknown;
	status: number;
	userKey?: SCIMDemoUserKey;
}): SCIMDemoOperation {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		effect: input.effect,
		method: input.method,
		requestBody: serializeBody(input.requestBody),
		resource: input.resource,
		responseBody: serializeBody(input.responseBody),
		status: input.status,
		userKey: input.userKey ?? null,
	};
}

async function createOperatorScope(operatorId: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(operatorId),
	);
	return Array.from(new Uint8Array(digest).slice(0, 6), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function getUserDefinition(userKey: SCIMDemoUserKey) {
	const definition = SCIM_DEMO_DIRECTORY_USERS.find(
		(user) => user.key === userKey,
	);
	if (!definition) throw createActionError("Directory user not found", 404);
	return definition;
}

function getGroupDefinition(groupKey: SCIMDemoGroupKey) {
	const definition = SCIM_DEMO_DIRECTORY_GROUPS.find(
		(group) => group.key === groupKey,
	);
	if (!definition) throw createActionError("Directory group not found", 404);
	return definition;
}

function getUserExternalId(scope: string, userKey: SCIMDemoUserKey) {
	return `${SCIM_DEMO_EXTERNAL_ID_PREFIX}${scope}:${userKey}`;
}

function getGroupExternalId(scope: string, groupKey: SCIMDemoGroupKey) {
	return `${SCIM_DEMO_EXTERNAL_ID_PREFIX}${scope}-${groupKey}`;
}

function getUserName(definition: SCIMDemoUserDefinition, scope: string) {
	return `${definition.emailLocalPart}+${scope}@acme.example`;
}

function getPersistedGroupName(
	definition: SCIMDemoGroupDefinition,
	scope: string,
) {
	return `${definition.displayName} (${scope})`;
}

function toISODate(value: Date | string | null | undefined) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getLatestDate(values: Array<Date | string | null | undefined>) {
	const timestamps = values
		.map((value) => toISODate(value))
		.filter((value): value is string => value !== null)
		.sort((left, right) => right.localeCompare(left));
	return timestamps[0] ?? null;
}

async function findSCIMUser(
	database: SCIMDemoServiceContext["database"],
	externalId: string,
) {
	return database.findOne<SCIMUserRow>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
			{ field: "externalId", value: externalId },
		],
	});
}

async function findSCIMGroup(
	database: SCIMDemoServiceContext["database"],
	externalId: string,
) {
	return database.findOne<SCIMGroupRow>({
		model: "scimGroup",
		where: [
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
			{ field: "externalId", value: externalId },
		],
	});
}

async function findSCIMGroupMemberships(
	database: SCIMDemoServiceContext["database"],
	groupIds: string[],
	scimUserId?: string,
) {
	if (groupIds.length === 0) return [];
	return database.findMany<SCIMGroupMemberRow>({
		model: "scimGroupMember",
		where: [
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
			{ field: "groupId", value: groupIds, operator: "in" },
			...(scimUserId ? [{ field: "scimUserId", value: scimUserId }] : []),
		],
	});
}

async function findTombstone(
	database: SCIMDemoServiceContext["database"],
	externalId: string,
) {
	return database.findOne<SCIMIdentityTombstoneRow>({
		model: "scimIdentityTombstone",
		where: [
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
			{ field: "externalId", value: externalId },
		],
	});
}

async function readApplicationState(
	database: SCIMDemoServiceContext["database"],
	scimUserId: string,
) {
	const scimUser = await database.findOne<SCIMUserRow>({
		model: "scimUser",
		where: [
			{ field: "id", value: scimUserId },
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
		],
	});
	if (!scimUser) throw new Error("The SCIM User was not persisted");
	const user = await database.findOne<SCIMDemoApplicationUserRow>({
		model: "user",
		where: [{ field: "id", value: scimUser.userId }],
	});
	if (!user) throw new Error("The application user was not persisted");
	return { scimUser, user };
}

async function readConnectionState(
	baseURL: string,
	lastSyncedAt: string | null,
): Promise<SCIMDemoConnectionState> {
	try {
		await requestSCIM(baseURL, "/Users?startIndex=1&count=1", {
			expectedStatus: 200,
		});
		return {
			id: SCIM_DEMO_CONNECTION_ID,
			name: "Acme directory",
			status: "connected",
			detail: "Credential verified against the SCIM endpoint",
			lastSyncedAt,
		};
	} catch (error) {
		return {
			id: SCIM_DEMO_CONNECTION_ID,
			name: "Acme directory",
			status: "error",
			detail: getErrorMessage(error),
			lastSyncedAt,
		};
	}
}

export async function getSCIMDemoWorkspace({
	baseURL,
	database,
	operatorId,
}: SCIMDemoServiceContext): Promise<SCIMDemoWorkspace> {
	const scope = await createOperatorScope(operatorId);
	const scimUsersPromise = Promise.all(
		SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
			findSCIMUser(database, getUserExternalId(scope, definition.key)),
		),
	);
	const tombstonesPromise = Promise.all(
		SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
			findTombstone(database, getUserExternalId(scope, definition.key)),
		),
	);
	const scimGroups = await Promise.all(
		SCIM_DEMO_DIRECTORY_GROUPS.map((definition) =>
			findSCIMGroup(database, getGroupExternalId(scope, definition.key)),
		),
	);
	const [scimUsers, tombstones, memberships] = await Promise.all([
		scimUsersPromise,
		tombstonesPromise,
		findSCIMGroupMemberships(
			database,
			scimGroups.flatMap((group) => (group ? [group.id] : [])),
		),
	]);

	const applicationUserIds = Array.from(
		new Set(
			[
				...scimUsers.map((user) => user?.userId),
				...tombstones.map((tombstone) => tombstone?.userId),
			].filter((userId): userId is string => Boolean(userId)),
		),
	);
	const applicationUsers = await Promise.all(
		applicationUserIds.map((userId) =>
			database.findOne<SCIMDemoApplicationUserRow>({
				model: "user",
				where: [{ field: "id", value: userId }],
			}),
		),
	);
	const applicationUserById = new Map(
		applicationUsers.flatMap((user) => (user ? [[user.id, user]] : [])),
	);
	const userKeyBySCIMId = new Map(
		scimUsers.flatMap((user, index) =>
			user ? [[user.id, SCIM_DEMO_DIRECTORY_USERS[index]?.key]] : [],
		),
	);

	const groups: SCIMDemoGroupState[] = SCIM_DEMO_DIRECTORY_GROUPS.map(
		(definition, index) => {
			const group = scimGroups[index];
			const members = group
				? memberships
						.filter((membership) => membership.groupId === group.id)
						.map((membership) => userKeyBySCIMId.get(membership.scimUserId))
						.filter((userKey): userKey is SCIMDemoUserKey => Boolean(userKey))
				: [];
			return {
				key: definition.key,
				displayName: definition.displayName,
				mappedRole: definition.mappedRole,
				created: Boolean(group),
				members,
				scimResourceId: group?.id ?? null,
				lastSyncedAt: toISODate(group?.updatedAt),
			};
		},
	);

	const users: SCIMDemoUserState[] = SCIM_DEMO_DIRECTORY_USERS.map(
		(definition, index) => {
			const scimUser = scimUsers[index];
			const tombstone = tombstones[index];
			const applicationUser = applicationUserById.get(
				scimUser?.userId ?? tombstone?.userId ?? "",
			);
			const userGroups = scimUser
				? groups
						.filter((group) => group.members.includes(definition.key))
						.map((group) => group.key)
				: [];
			let lifecycle: SCIMDemoUserLifecycle = "not-provisioned";
			if (scimUser) lifecycle = scimUser.active ? "active" : "inactive";
			else if (tombstone) lifecycle = "deleted";
			let applicationAccess: SCIMDemoApplicationAccess = "none";
			if (applicationUser) {
				applicationAccess = applicationUser.scimDemoActive
					? "active"
					: "disabled";
			}
			return {
				key: definition.key,
				displayName:
					scimUser?.displayName ??
					applicationUser?.name ??
					definition.displayName,
				email:
					scimUser?.userName ??
					applicationUser?.email ??
					getUserName(definition, scope),
				initials: definition.initials,
				defaultGroupKey: definition.defaultGroupKey,
				lifecycle,
				applicationAccess,
				applicationUserId: applicationUser?.id ?? null,
				groups: userGroups,
				lastSyncedAt: toISODate(scimUser?.updatedAt ?? tombstone?.deletedAt),
				role: applicationUser?.scimDemoRole ?? null,
				scimResourceId: scimUser?.id ?? null,
			};
		},
	);

	const lastSyncedAt = getLatestDate([
		...scimUsers.map((user) => user?.updatedAt),
		...tombstones.map((tombstone) => tombstone?.deletedAt),
		...scimGroups.map((group) => group?.updatedAt),
	]);
	const connection = await readConnectionState(baseURL, lastSyncedAt);
	return { connection, groups, users };
}

export async function checkSCIMDemoAccess(
	context: SCIMDemoServiceContext,
	userKey: SCIMDemoUserKey,
): Promise<SCIMDemoAccessDecision> {
	getUserDefinition(userKey);
	const scope = await createOperatorScope(context.operatorId);
	const externalId = getUserExternalId(scope, userKey);
	const scimUser = await findSCIMUser(context.database, externalId);
	const tombstone = scimUser
		? null
		: await findTombstone(context.database, externalId);
	const applicationUserId = scimUser?.userId ?? tombstone?.userId;
	if (!applicationUserId) {
		throw createActionError("Provision this user before checking access", 404);
	}
	const applicationUser =
		await context.database.findOne<SCIMDemoApplicationUserRow>({
			model: "user",
			where: [{ field: "id", value: applicationUserId }],
		});
	if (!applicationUser) {
		throw createActionError("The application user was not found", 404);
	}
	const allowed = applicationUser.scimDemoActive === true;
	return {
		allowed,
		applicationUserId,
		checkedAt: new Date().toISOString(),
		message: allowed
			? "The application authorized this user"
			: "The application denied access for this user",
		role: applicationUser.scimDemoRole ?? null,
		userKey,
	};
}

async function provisionUser(
	context: SCIMDemoActionContext,
	userKey: SCIMDemoUserKey,
) {
	const scope = await createOperatorScope(context.operatorId);
	const definition = getUserDefinition(userKey);
	const externalId = getUserExternalId(scope, userKey);
	const existing = await findSCIMUser(context.database, externalId);
	if (existing) {
		throw createActionError("This directory user is already provisioned", 409);
	}
	const retainedIdentity = await findTombstone(context.database, externalId);
	const retainedApplicationUser = retainedIdentity
		? await context.database.findOne<SCIMDemoApplicationUserRow>({
				model: "user",
				where: [{ field: "id", value: retainedIdentity.userId }],
			})
		: null;
	const userName = getUserName(definition, scope);
	const displayName = retainedApplicationUser?.name ?? definition.displayName;
	const requestBody = {
		schemas: [SCIM_USER_SCHEMA],
		externalId,
		userName,
		displayName,
		name: {
			formatted: displayName,
			givenName: definition.givenName,
			familyName: definition.familyName,
		},
		emails: [{ value: userName, type: "work", primary: true }],
		active: true,
	};
	const response = await requestSCIM(context.baseURL, "/Users", {
		method: "POST",
		body: requestBody,
		expectedStatus: 201,
	});
	const resource = readSCIMUser(response.body);
	const state = await readApplicationState(context.database, resource.id);
	assertState(
		resource.externalId === externalId,
		"externalId was not retained",
	);
	assertState(resource.active, "The provisioned SCIM User is not active");
	assertState(
		state.user.scimDemoActive === true,
		"Application access was not enabled",
	);
	assertState(
		(state.user.scimDemoRole ?? null) === null,
		"An application role was granted before Group membership",
	);
	if (retainedIdentity) {
		assertState(
			state.scimUser.userId === retainedIdentity.userId,
			"Reprovisioning did not restore the retained application identity",
		);
	}
	return [
		createOperation({
			method: "POST",
			resource: "/Users",
			status: response.status,
			userKey,
			requestBody,
			responseBody: response.body,
			effect: retainedIdentity
				? "Application identity restored with active access"
				: "User created in Better Auth with active access",
		}),
	];
}

async function updateProfile(
	context: SCIMDemoActionContext,
	userKey: SCIMDemoUserKey,
	displayName: string,
) {
	const value = displayName.trim();
	if (value.length < 2 || value.length > 80) {
		throw createActionError(
			"Display name must be between 2 and 80 characters",
			400,
		);
	}
	const scope = await createOperatorScope(context.operatorId);
	const scimUser = await findSCIMUser(
		context.database,
		getUserExternalId(scope, userKey),
	);
	if (!scimUser) throw createActionError("Provision this user first", 409);
	const requestBody = {
		schemas: [SCIM_PATCH_SCHEMA],
		Operations: [{ op: "Replace", path: "displayName", value }],
	};
	const resourcePath = `/Users/${encodeURIComponent(scimUser.id)}`;
	const response = await requestSCIM(context.baseURL, resourcePath, {
		method: "PATCH",
		body: requestBody,
		expectedStatus: 204,
	});
	const state = await readApplicationState(context.database, scimUser.id);
	assertState(
		state.scimUser.displayName === value && state.user.name === value,
		"The updated profile was not synchronized to the application user",
	);
	return [
		createOperation({
			method: "PATCH",
			resource: resourcePath,
			status: response.status,
			userKey,
			requestBody,
			effect: "Directory profile synchronized to the Better Auth user",
		}),
	];
}

async function ensureGroup(
	context: SCIMDemoActionContext,
	scope: string,
	definition: SCIMDemoGroupDefinition,
	userKey: SCIMDemoUserKey,
) {
	const externalId = getGroupExternalId(scope, definition.key);
	const existing = await findSCIMGroup(context.database, externalId);
	if (existing) return { group: existing, operations: [] };
	const requestBody = {
		schemas: [SCIM_GROUP_SCHEMA],
		externalId,
		displayName: getPersistedGroupName(definition, scope),
		members: [],
	};
	const response = await requestSCIM(context.baseURL, "/Groups", {
		method: "POST",
		body: requestBody,
		expectedStatus: 201,
	});
	const resource = readSCIMGroup(response.body);
	assertState(
		resource.externalId === externalId,
		"Group externalId was not retained",
	);
	const group = await findSCIMGroup(context.database, externalId);
	assertState(group?.id === resource.id, "The SCIM Group was not persisted");
	return {
		group,
		operations: [
			createOperation({
				method: "POST",
				resource: "/Groups",
				status: response.status,
				userKey,
				requestBody,
				responseBody: response.body,
				effect: `${definition.displayName} group created`,
			}),
		],
	};
}

async function setGroups(
	context: SCIMDemoActionContext,
	userKey: SCIMDemoUserKey,
	groupKeys: readonly SCIMDemoGroupKey[],
) {
	const scope = await createOperatorScope(context.operatorId);
	const scimUser = await findSCIMUser(
		context.database,
		getUserExternalId(scope, userKey),
	);
	if (!scimUser) throw createActionError("Provision this user first", 409);
	const requestedGroups = new Set(groupKeys);
	const operations: SCIMDemoOperation[] = [];
	const scopedGroups: Array<{
		definition: SCIMDemoGroupDefinition;
		group: SCIMGroupRow;
	}> = [];

	try {
		for (const definition of SCIM_DEMO_DIRECTORY_GROUPS) {
			let group = await findSCIMGroup(
				context.database,
				getGroupExternalId(scope, definition.key),
			);
			if (requestedGroups.has(definition.key) && !group) {
				const created = await ensureGroup(context, scope, definition, userKey);
				group = created.group;
				operations.push(...created.operations);
			}
			if (!group) continue;
			scopedGroups.push({ definition, group });

			const membership = await context.database.findOne<SCIMGroupMemberRow>({
				model: "scimGroupMember",
				where: [
					{ field: "groupId", value: group.id },
					{ field: "scimUserId", value: scimUser.id },
				],
			});
			const shouldBeMember = requestedGroups.has(definition.key);
			if (Boolean(membership) === shouldBeMember) continue;

			const requestBody = {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					shouldBeMember
						? {
								op: "Add",
								path: "members",
								value: [{ value: scimUser.id }],
							}
						: {
								op: "Remove",
								path: "members",
								value: [{ value: scimUser.id }],
							},
				],
			};
			const resourcePath = `/Groups/${encodeURIComponent(group.id)}`;
			const response = await requestSCIM(context.baseURL, resourcePath, {
				method: "PATCH",
				body: requestBody,
				expectedStatus: 204,
			});
			operations.push(
				createOperation({
					method: "PATCH",
					resource: resourcePath,
					status: response.status,
					userKey,
					requestBody,
					effect: shouldBeMember
						? `User added to ${definition.displayName}`
						: `User removed from ${definition.displayName}`,
				}),
			);
		}
	} catch (error) {
		const failure = createRequestError(
			getErrorMessage(error),
			getSCIMDemoError(error).status,
		);
		failure.operations = [...operations];
		throw failure;
	}

	const membershipRows = await findSCIMGroupMemberships(
		context.database,
		scopedGroups.map(({ group }) => group.id),
		scimUser.id,
	);
	const currentGroupIds = new Set(
		membershipRows.map((membership) => membership.groupId),
	);
	const currentGroupKeys = new Set(
		scopedGroups.flatMap(({ definition, group }) =>
			currentGroupIds.has(group.id) ? [definition.key] : [],
		),
	);
	assertState(
		SCIM_DEMO_DIRECTORY_GROUPS.every(
			(definition) =>
				currentGroupKeys.has(definition.key) ===
				requestedGroups.has(definition.key),
		),
		"SCIM Group membership did not match the requested state",
	);
	const state = await readApplicationState(context.database, scimUser.id);
	const expectedRole =
		scimUser.active && requestedGroups.has("finance-admins")
			? SCIM_DEMO_ROLE
			: null;
	assertState(
		(state.user.scimDemoRole ?? null) === expectedRole,
		"The application role was not reconciled from Group membership",
	);
	return operations;
}

async function setUserActive(
	context: SCIMDemoActionContext,
	userKey: SCIMDemoUserKey,
	active: boolean,
) {
	const scope = await createOperatorScope(context.operatorId);
	const scimUser = await findSCIMUser(
		context.database,
		getUserExternalId(scope, userKey),
	);
	if (!scimUser) throw createActionError("Provision this user first", 409);
	if (scimUser.active === active) {
		throw createActionError(
			active ? "This user is already active" : "This user is already inactive",
			409,
		);
	}
	const requestBody = {
		schemas: [SCIM_PATCH_SCHEMA],
		Operations: [{ op: "Replace", path: "active", value: active }],
	};
	const resourcePath = `/Users/${encodeURIComponent(scimUser.id)}`;
	const response = await requestSCIM(context.baseURL, resourcePath, {
		method: "PATCH",
		body: requestBody,
		expectedStatus: 204,
	});
	const state = await readApplicationState(context.database, scimUser.id);
	assertState(
		state.scimUser.active === active && state.user.scimDemoActive === active,
		"Application access did not follow the SCIM active state",
	);
	const financeGroup = await findSCIMGroup(
		context.database,
		getGroupExternalId(scope, "finance-admins"),
	);
	const financeMembership = financeGroup
		? await context.database.findOne<SCIMGroupMemberRow>({
				model: "scimGroupMember",
				where: [
					{ field: "groupId", value: financeGroup.id },
					{ field: "scimUserId", value: scimUser.id },
				],
			})
		: null;
	const expectedRole = active && financeMembership ? SCIM_DEMO_ROLE : null;
	assertState(
		(state.user.scimDemoRole ?? null) === expectedRole,
		"The application role did not follow the SCIM active state",
	);
	return [
		createOperation({
			method: "PATCH",
			resource: resourcePath,
			status: response.status,
			userKey,
			requestBody,
			effect: active
				? "Application access restored; eligible roles reconciled"
				: "Application access disabled; Group membership retained",
		}),
	];
}

async function deleteUser(
	context: SCIMDemoActionContext,
	userKey: SCIMDemoUserKey,
) {
	const scope = await createOperatorScope(context.operatorId);
	const externalId = getUserExternalId(scope, userKey);
	const scimUser = await findSCIMUser(context.database, externalId);
	if (!scimUser) throw createActionError("This user has no SCIM resource", 409);
	const resourcePath = `/Users/${encodeURIComponent(scimUser.id)}`;
	const response = await requestSCIM(context.baseURL, resourcePath, {
		method: "DELETE",
		expectedStatus: 204,
	});
	const [missingUser, tombstone, applicationUser] = await Promise.all([
		findSCIMUser(context.database, externalId),
		findTombstone(context.database, externalId),
		context.database.findOne<SCIMDemoApplicationUserRow>({
			model: "user",
			where: [{ field: "id", value: scimUser.userId }],
		}),
	]);
	assertState(!missingUser, "The SCIM User resource was not deleted");
	assertState(
		tombstone?.userId === scimUser.userId,
		"The stable application identity was not retained",
	);
	assertState(
		applicationUser?.scimDemoActive === false &&
			(applicationUser.scimDemoRole ?? null) === null,
		"Deleted SCIM access was not removed from the application user",
	);
	return [
		createOperation({
			method: "DELETE",
			resource: resourcePath,
			status: response.status,
			userKey,
			effect:
				"SCIM resource removed; Better Auth identity retained without access",
		}),
	];
}

async function cleanupApplicationUser(
	database: SCIMDemoActionContext["database"],
	userId: string,
	allowedExternalIds: ReadonlySet<string>,
) {
	const liveSCIMUsers = await database.findMany<SCIMUserRow>({
		model: "scimUser",
		where: [{ field: "userId", value: userId }],
	});
	if (liveSCIMUsers.length > 0) {
		throw new Error("The demo application user still has a SCIM resource");
	}
	const tombstones = await database.findMany<SCIMIdentityTombstoneRow>({
		model: "scimIdentityTombstone",
		where: [{ field: "userId", value: userId }],
	});
	if (
		tombstones.some(
			(tombstone) => !allowedExternalIds.has(tombstone.externalId),
		)
	) {
		throw new Error("The application user is linked outside this demo sandbox");
	}
	await database.deleteMany({
		model: "scimIdentityTombstone",
		where: [{ field: "userId", value: userId }],
	});
	await database.deleteMany({
		model: "scimSubject",
		where: [{ field: "userId", value: userId }],
	});
	await database.deleteMany({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
}

async function resetSandbox(context: SCIMDemoActionContext) {
	const scope = await createOperatorScope(context.operatorId);
	const userExternalIds = new Set(
		SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
			getUserExternalId(scope, definition.key),
		),
	);
	const [groups, users, tombstones] = await Promise.all([
		Promise.all(
			SCIM_DEMO_DIRECTORY_GROUPS.map((definition) =>
				findSCIMGroup(
					context.database,
					getGroupExternalId(scope, definition.key),
				),
			),
		),
		Promise.all(
			SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
				findSCIMUser(
					context.database,
					getUserExternalId(scope, definition.key),
				),
			),
		),
		Promise.all(
			SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
				findTombstone(
					context.database,
					getUserExternalId(scope, definition.key),
				),
			),
		),
	]);
	const applicationUserIds = new Set(
		[
			...users.map((user) => user?.userId),
			...tombstones.map((tombstone) => tombstone?.userId),
		].filter((userId): userId is string => Boolean(userId)),
	);

	for (const group of groups) {
		if (!group) continue;
		await requestSCIM(
			context.baseURL,
			`/Groups/${encodeURIComponent(group.id)}`,
			{ method: "DELETE", expectedStatus: [204, 404] },
		);
	}
	for (const user of users) {
		if (!user) continue;
		await requestSCIM(
			context.baseURL,
			`/Users/${encodeURIComponent(user.id)}`,
			{ method: "DELETE", expectedStatus: [204, 404] },
		);
	}
	for (const userId of applicationUserIds) {
		await cleanupApplicationUser(context.database, userId, userExternalIds);
	}

	const [remainingUsers, remainingGroups, remainingTombstones] =
		await Promise.all([
			Promise.all(
				Array.from(userExternalIds, (externalId) =>
					findSCIMUser(context.database, externalId),
				),
			),
			Promise.all(
				SCIM_DEMO_DIRECTORY_GROUPS.map((definition) =>
					findSCIMGroup(
						context.database,
						getGroupExternalId(scope, definition.key),
					),
				),
			),
			Promise.all(
				Array.from(userExternalIds, (externalId) =>
					findTombstone(context.database, externalId),
				),
			),
		]);
	assertState(
		[...remainingUsers, ...remainingGroups, ...remainingTombstones].every(
			(resource) => !resource,
		),
		"The sandbox still contains SCIM resources",
	);
}

export async function performSCIMDemoAction(
	context: SCIMDemoActionContext,
	action: SCIMDemoAction,
): Promise<SCIMDemoActionResult> {
	let operations: SCIMDemoOperation[];
	switch (action.type) {
		case "provision-user":
			operations = await provisionUser(context, action.userKey);
			break;
		case "update-profile":
			operations = await updateProfile(
				context,
				action.userKey,
				action.displayName,
			);
			break;
		case "set-groups":
			for (const groupKey of action.groupKeys) getGroupDefinition(groupKey);
			operations = await setGroups(context, action.userKey, action.groupKeys);
			break;
		case "set-active":
			operations = await setUserActive(context, action.userKey, action.active);
			break;
		case "delete-user":
			operations = await deleteUser(context, action.userKey);
			break;
		case "reset-sandbox":
			await resetSandbox(context);
			operations = [];
			break;
		default: {
			const exhaustiveAction: never = action;
			return exhaustiveAction;
		}
	}
	const workspace = await getSCIMDemoWorkspace(context);
	return { operations, workspace };
}
