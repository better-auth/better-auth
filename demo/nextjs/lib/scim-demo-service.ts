import type { DBAdapter } from "better-auth";
import { getSCIMDemoToken, SCIM_DEMO_CONNECTION_ID } from "./scim-demo.ts";
import type { SCIMDemoGroupKey, SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import {
	isSCIMDemoUserKey,
	SCIM_DEMO_DIRECTORY_GROUPS,
	SCIM_DEMO_DIRECTORY_USERS,
	SCIM_DEMO_ROLE,
} from "./scim-demo-catalog.ts";
import type {
	SCIMDemoAccountLinkStatus,
	SCIMDemoAction,
	SCIMDemoActionResult,
	SCIMDemoConnectionState,
	SCIMDemoEmployeePortalState,
	SCIMDemoGroupState,
	SCIMDemoOperation,
	SCIMDemoSessionStatus,
	SCIMDemoUserLifecycle,
	SCIMDemoUserState,
	SCIMDemoWorkspace,
} from "./scim-demo-contract.ts";
import { isSCIMDemoOperation } from "./scim-demo-contract.ts";
import {
	computeSCIMDemoWorkspaceId,
	createSCIMDemoEmployeePortalPath,
	createSCIMDemoUserEmail,
	createSCIMDemoUserExternalId,
	isSCIMDemoWorkspaceId,
	SCIM_DEMO_EXTERNAL_ID_PREFIX,
} from "./scim-demo-identity.ts";
import {
	getSCIMDemoOIDCIssuer,
	SCIM_DEMO_SSO_PROVIDER_ID,
} from "./scim-demo-oidc.ts";

const SCIM_BASE_PATH = "/api/auth/scim/v2";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_REQUEST_TIMEOUT_MS = 5_000;

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
	scimDemoRole?: string | null;
}

interface SCIMDemoAccountRow {
	id: string;
	issuer: string;
	providerAccountId: string;
	providerId: string;
	userId: string;
}

interface SCIMDemoSessionRow {
	expiresAt: Date | string;
	id: string;
	userId: string;
}

interface SCIMDemoUserAuthenticationState {
	activeSessionCount: number;
	accountLinkStatus: SCIMDemoAccountLinkStatus;
	sessionStatus: SCIMDemoSessionStatus;
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

interface SCIMDemoUserGraph {
	deleteUser(userId: string): Promise<void>;
}

interface SCIMDemoActionContext extends SCIMDemoServiceContext {
	userGraph: SCIMDemoUserGraph;
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
		return error.operations.filter(isSCIMDemoOperation);
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

function getGroupExternalId(workspaceId: string, groupKey: SCIMDemoGroupKey) {
	return `${SCIM_DEMO_EXTERNAL_ID_PREFIX}${workspaceId}-${groupKey}`;
}

function getPersistedGroupName(
	definition: SCIMDemoGroupDefinition,
	workspaceId: string,
) {
	return `${definition.displayName} (${workspaceId})`;
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

function isActiveSession(session: SCIMDemoSessionRow, now: Date) {
	const expiresAt =
		session.expiresAt instanceof Date
			? session.expiresAt
			: new Date(session.expiresAt);
	return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
}

async function readUserAuthenticationState(
	database: SCIMDemoServiceContext["database"],
	userId: string | null,
	externalId: string,
): Promise<SCIMDemoUserAuthenticationState> {
	if (!userId) {
		return {
			activeSessionCount: 0,
			accountLinkStatus: "not-linked" as const,
			sessionStatus: "none" as const,
		};
	}
	const [account, sessions] = await Promise.all([
		database.findOne<SCIMDemoAccountRow>({
			model: "account",
			where: [
				{ field: "userId", value: userId },
				{ field: "issuer", value: getSCIMDemoOIDCIssuer() },
				{ field: "providerAccountId", value: externalId },
				{ field: "providerId", value: SCIM_DEMO_SSO_PROVIDER_ID },
			],
		}),
		database.findMany<SCIMDemoSessionRow>({
			model: "session",
			where: [{ field: "userId", value: userId }],
		}),
	]);
	const activeSessionCount = sessions.filter((session) =>
		isActiveSession(session, new Date()),
	).length;
	return {
		activeSessionCount,
		accountLinkStatus: account ? "linked" : "not-linked",
		sessionStatus: activeSessionCount > 0 ? "active" : "none",
	};
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
	const workspaceId = await computeSCIMDemoWorkspaceId(operatorId);
	const scimUsersPromise = Promise.all(
		SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
			findSCIMUser(
				database,
				createSCIMDemoUserExternalId(workspaceId, definition.key),
			),
		),
	);
	const tombstonesPromise = Promise.all(
		SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
			findTombstone(
				database,
				createSCIMDemoUserExternalId(workspaceId, definition.key),
			),
		),
	);
	const scimGroups = await Promise.all(
		SCIM_DEMO_DIRECTORY_GROUPS.map((definition) =>
			findSCIMGroup(database, getGroupExternalId(workspaceId, definition.key)),
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

	const users: SCIMDemoUserState[] = await Promise.all(
		SCIM_DEMO_DIRECTORY_USERS.map(async (definition, index) => {
			const scimUser = scimUsers[index];
			const tombstone = tombstones[index];
			const applicationUser = applicationUserById.get(
				scimUser?.userId ?? tombstone?.userId ?? "",
			);
			const externalId = createSCIMDemoUserExternalId(
				workspaceId,
				definition.key,
			);
			const authentication = await readUserAuthenticationState(
				database,
				applicationUser?.id ?? null,
				externalId,
			);
			const userGroups = scimUser
				? groups
						.filter((group) => group.members.includes(definition.key))
						.map((group) => group.key)
				: [];
			let lifecycle: SCIMDemoUserLifecycle = "not-provisioned";
			if (scimUser) lifecycle = scimUser.active ? "active" : "inactive";
			else if (tombstone) lifecycle = "deleted";
			return {
				activeSessionCount: authentication.activeSessionCount,
				key: definition.key,
				displayName:
					scimUser?.displayName ??
					applicationUser?.name ??
					definition.displayName,
				email:
					scimUser?.userName ??
					applicationUser?.email ??
					createSCIMDemoUserEmail(workspaceId, definition.key),
				initials: definition.initials,
				defaultGroupKey: definition.defaultGroupKey,
				lifecycle,
				applicationUserId: applicationUser?.id ?? null,
				employeePortalPath: createSCIMDemoEmployeePortalPath(
					workspaceId,
					definition.key,
				),
				groups: userGroups,
				accountLinkStatus: authentication.accountLinkStatus,
				lastSyncedAt: toISODate(scimUser?.updatedAt ?? tombstone?.deletedAt),
				role: applicationUser?.scimDemoRole ?? null,
				scimResourceId: scimUser?.id ?? null,
				sessionStatus: authentication.sessionStatus,
			};
		}),
	);

	const lastSyncedAt = getLatestDate([
		...scimUsers.map((user) => user?.updatedAt),
		...tombstones.map((tombstone) => tombstone?.deletedAt),
		...scimGroups.map((group) => group?.updatedAt),
	]);
	const connection = await readConnectionState(baseURL, lastSyncedAt);
	return { connection, groups, users };
}

export async function hasSCIMDemoEmployeeRecord(
	database: SCIMDemoServiceContext["database"],
	userId: string,
) {
	const [source, tombstone] = await Promise.all([
		database.findOne<SCIMUserRow>({
			model: "scimUser",
			where: [
				{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
				{ field: "userId", value: userId },
			],
		}),
		database.findOne<SCIMIdentityTombstoneRow>({
			model: "scimIdentityTombstone",
			where: [
				{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
				{ field: "userId", value: userId },
			],
		}),
	]);
	return Boolean(source || tombstone);
}

export async function assertSCIMDemoOperatorAccess(
	database: SCIMDemoServiceContext["database"],
	userId: string,
) {
	if (await hasSCIMDemoEmployeeRecord(database, userId)) {
		throw createActionError(
			"Employee sessions cannot manage the SCIM sandbox",
			403,
		);
	}
}

export async function getSCIMDemoEmployeePortalState(
	database: SCIMDemoServiceContext["database"],
	workspaceId: string,
	userKey: string,
	authenticatedUserId?: string | null,
): Promise<SCIMDemoEmployeePortalState> {
	if (!isSCIMDemoWorkspaceId(workspaceId) || !isSCIMDemoUserKey(userKey)) {
		return { status: "invalid", message: "This demo employee link is invalid" };
	}
	const definition = getUserDefinition(userKey);
	const externalId = createSCIMDemoUserExternalId(workspaceId, userKey);
	const [scimUser, tombstone] = await Promise.all([
		findSCIMUser(database, externalId),
		findTombstone(database, externalId),
	]);
	const applicationUserId = scimUser?.userId ?? tombstone?.userId ?? null;
	const applicationUser = applicationUserId
		? await database.findOne<SCIMDemoApplicationUserRow>({
				model: "user",
				where: [{ field: "id", value: applicationUserId }],
			})
		: null;
	let directoryStatus: SCIMDemoUserLifecycle = "not-provisioned";
	if (scimUser) directoryStatus = scimUser.active ? "active" : "inactive";
	else if (tombstone) directoryStatus = "deleted";
	const authentication = await readUserAuthenticationState(
		database,
		applicationUser?.id ?? null,
		externalId,
	);
	return {
		status: "ready",
		activeSessionCount: authentication.activeSessionCount,
		applicationUserId: applicationUser?.id ?? null,
		directoryStatus,
		displayName:
			scimUser?.displayName ?? applicationUser?.name ?? definition.displayName,
		email:
			scimUser?.userName ??
			applicationUser?.email ??
			createSCIMDemoUserEmail(workspaceId, userKey),
		accountLinkStatus: authentication.accountLinkStatus,
		isCurrentEmployee:
			Boolean(applicationUser?.id) &&
			authenticatedUserId === applicationUser?.id,
		role: applicationUser?.scimDemoRole ?? null,
		sessionStatus: authentication.sessionStatus,
		userKey,
		workspaceId,
	};
}

async function provisionUser(
	context: SCIMDemoActionContext,
	userKey: SCIMDemoUserKey,
) {
	const workspaceId = await computeSCIMDemoWorkspaceId(context.operatorId);
	const definition = getUserDefinition(userKey);
	const externalId = createSCIMDemoUserExternalId(workspaceId, userKey);
	const existing = await findSCIMUser(context.database, externalId);
	if (existing) {
		throw createActionError("This directory user is already provisioned", 409);
	}
	const retainedTombstone = await findTombstone(context.database, externalId);
	const retainedApplicationUser = retainedTombstone
		? await context.database.findOne<SCIMDemoApplicationUserRow>({
				model: "user",
				where: [{ field: "id", value: retainedTombstone.userId }],
			})
		: null;
	const userName = createSCIMDemoUserEmail(workspaceId, userKey);
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
		(state.user.scimDemoRole ?? null) === null,
		"An application role was granted before Group membership",
	);
	if (retainedTombstone) {
		assertState(
			state.scimUser.userId === retainedTombstone.userId,
			"Reprovisioning did not restore the retained application user",
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
			effect: retainedTombstone
				? "Retained Better Auth user restored with active access"
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
	const workspaceId = await computeSCIMDemoWorkspaceId(context.operatorId);
	const scimUser = await findSCIMUser(
		context.database,
		createSCIMDemoUserExternalId(workspaceId, userKey),
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
	workspaceId: string,
	definition: SCIMDemoGroupDefinition,
	userKey: SCIMDemoUserKey,
) {
	const externalId = getGroupExternalId(workspaceId, definition.key);
	const existing = await findSCIMGroup(context.database, externalId);
	if (existing) return { group: existing, operations: [] };
	const requestBody = {
		schemas: [SCIM_GROUP_SCHEMA],
		externalId,
		displayName: getPersistedGroupName(definition, workspaceId),
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
	const workspaceId = await computeSCIMDemoWorkspaceId(context.operatorId);
	const scimUser = await findSCIMUser(
		context.database,
		createSCIMDemoUserExternalId(workspaceId, userKey),
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
				getGroupExternalId(workspaceId, definition.key),
			);
			if (requestedGroups.has(definition.key) && !group) {
				const created = await ensureGroup(
					context,
					workspaceId,
					definition,
					userKey,
				);
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
	const workspaceId = await computeSCIMDemoWorkspaceId(context.operatorId);
	const scimUser = await findSCIMUser(
		context.database,
		createSCIMDemoUserExternalId(workspaceId, userKey),
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
		state.scimUser.active === active,
		"The persisted SCIM active state did not match the request",
	);
	const authentication = await readUserAuthenticationState(
		context.database,
		state.user.id,
		createSCIMDemoUserExternalId(workspaceId, userKey),
	);
	if (!active) {
		assertState(
			authentication.activeSessionCount === 0,
			"Inactive directory access still had an active session",
		);
	}
	const financeGroup = await findSCIMGroup(
		context.database,
		getGroupExternalId(workspaceId, "finance-admins"),
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
	const workspaceId = await computeSCIMDemoWorkspaceId(context.operatorId);
	const externalId = createSCIMDemoUserExternalId(workspaceId, userKey);
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
		"The stable application user was not retained",
	);
	assertState(
		Boolean(applicationUser) &&
			(applicationUser?.scimDemoRole ?? null) === null,
		"Deleted SCIM access was not removed from the application user",
	);
	const authentication = await readUserAuthenticationState(
		context.database,
		applicationUser?.id ?? null,
		externalId,
	);
	assertState(
		authentication.activeSessionCount === 0,
		"Deleted directory access still had an active session",
	);
	return [
		createOperation({
			method: "DELETE",
			resource: resourcePath,
			status: response.status,
			userKey,
			effect: "SCIM resource removed; Better Auth user retained without access",
		}),
	];
}

async function assertSandboxUserGraphDeletable(
	context: SCIMDemoActionContext,
	userId: string,
	allowedExternalIds: ReadonlySet<string>,
	options: { allowSandboxSCIMUsers: boolean },
) {
	const { database } = context;
	const [liveSCIMUsers, tombstones, accounts] = await Promise.all([
		database.findMany<SCIMUserRow>({
			model: "scimUser",
			where: [{ field: "userId", value: userId }],
		}),
		database.findMany<SCIMIdentityTombstoneRow>({
			model: "scimIdentityTombstone",
			where: [{ field: "userId", value: userId }],
		}),
		database.findMany<SCIMDemoAccountRow>({
			model: "account",
			where: [{ field: "userId", value: userId }],
		}),
	]);
	if (
		liveSCIMUsers.some(
			(source) =>
				source.connectionId !== SCIM_DEMO_CONNECTION_ID ||
				!source.externalId ||
				!allowedExternalIds.has(source.externalId),
		)
	) {
		throw new Error("The application user is linked outside this demo sandbox");
	}
	if (!options.allowSandboxSCIMUsers && liveSCIMUsers.length > 0) {
		throw new Error("The demo application user still has a SCIM resource");
	}
	if (
		tombstones.some(
			(tombstone) =>
				tombstone.connectionId !== SCIM_DEMO_CONNECTION_ID ||
				!allowedExternalIds.has(tombstone.externalId),
		)
	) {
		throw new Error("The application user is linked outside this demo sandbox");
	}
	if (
		accounts.some(
			(account) =>
				account.issuer !== getSCIMDemoOIDCIssuer() ||
				!allowedExternalIds.has(account.providerAccountId) ||
				account.providerId !== SCIM_DEMO_SSO_PROVIDER_ID,
		)
	) {
		throw new Error(
			"The application user has a non-demo authentication account",
		);
	}
}

async function deleteSandboxApplicationUser(
	context: SCIMDemoActionContext,
	userId: string,
	allowedExternalIds: ReadonlySet<string>,
) {
	await assertSandboxUserGraphDeletable(context, userId, allowedExternalIds, {
		allowSandboxSCIMUsers: false,
	});
	const { database } = context;
	await context.userGraph.deleteUser(userId);
	const remainingUser = await database.findOne<SCIMDemoApplicationUserRow>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
	assertState(!remainingUser, "The demo application user was not deleted");
	await database.deleteMany({
		model: "scimSubject",
		where: [{ field: "userId", value: userId }],
	});
	await database.deleteMany({
		model: "scimIdentityTombstone",
		where: [{ field: "userId", value: userId }],
	});
}

async function resetSandbox(context: SCIMDemoActionContext) {
	const workspaceId = await computeSCIMDemoWorkspaceId(context.operatorId);
	const userExternalIds = new Set(
		SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
			createSCIMDemoUserExternalId(workspaceId, definition.key),
		),
	);
	const [groups, users, tombstones] = await Promise.all([
		Promise.all(
			SCIM_DEMO_DIRECTORY_GROUPS.map((definition) =>
				findSCIMGroup(
					context.database,
					getGroupExternalId(workspaceId, definition.key),
				),
			),
		),
		Promise.all(
			SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
				findSCIMUser(
					context.database,
					createSCIMDemoUserExternalId(workspaceId, definition.key),
				),
			),
		),
		Promise.all(
			SCIM_DEMO_DIRECTORY_USERS.map((definition) =>
				findTombstone(
					context.database,
					createSCIMDemoUserExternalId(workspaceId, definition.key),
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
	await Promise.all(
		Array.from(applicationUserIds, (userId) =>
			assertSandboxUserGraphDeletable(context, userId, userExternalIds, {
				allowSandboxSCIMUsers: true,
			}),
		),
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
		await deleteSandboxApplicationUser(context, userId, userExternalIds);
	}

	const [
		remainingUsers,
		remainingGroups,
		remainingTombstones,
		remainingSubjects,
	] = await Promise.all([
		Promise.all(
			Array.from(userExternalIds, (externalId) =>
				findSCIMUser(context.database, externalId),
			),
		),
		Promise.all(
			SCIM_DEMO_DIRECTORY_GROUPS.map((definition) =>
				findSCIMGroup(
					context.database,
					getGroupExternalId(workspaceId, definition.key),
				),
			),
		),
		Promise.all(
			Array.from(userExternalIds, (externalId) =>
				findTombstone(context.database, externalId),
			),
		),
		Promise.all(
			Array.from(applicationUserIds, (userId) =>
				context.database.findOne({
					model: "scimSubject",
					where: [{ field: "userId", value: userId }],
				}),
			),
		),
	]);
	assertState(
		[
			...remainingUsers,
			...remainingGroups,
			...remainingTombstones,
			...remainingSubjects,
		].every((resource) => !resource),
		"The sandbox still contains SCIM resources",
	);
}

export async function applySCIMDemoAction(
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
