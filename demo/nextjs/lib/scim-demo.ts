import { scim } from "@better-auth/scim";
import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	DBAdapter,
} from "better-auth";
import type {
	SCIMDemoCheckpoint,
	SCIMDemoCheckpointId,
} from "./scim-demo-types.ts";

const SCIM_BASE_PATH = "/api/auth/scim/v2";
const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export const SCIM_DEMO_CONNECTION_ID = "demo-directory";
export const SCIM_DEMO_PROVISIONING_DOMAIN_ID = "scim-demo";
export const SCIM_DEMO_ROLE = "billing-manager";

const disabledSCIMDemoPlugin = {
	id: "scim-demo-disabled",
} satisfies BetterAuthPlugin;

interface SCIMDemoUserRow {
	id: string;
	scimDemoActive?: boolean | null;
	scimDemoRole?: string | null;
}

interface SCIMUserRow {
	id: string;
	connectionId: string;
	externalId?: string | null;
	userId: string;
}

interface SCIMGroupRow {
	id: string;
	connectionId: string;
	externalId?: string | null;
}

interface SCIMIdentityTombstoneRow {
	id: string;
	connectionId: string;
	externalId: string;
	userId: string;
}

interface SCIMUserResource {
	id: string;
	externalId?: string;
	userName: string;
	active: boolean;
}

interface SCIMGroupResource {
	id: string;
	externalId?: string;
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
	method?: "GET" | "POST" | "PATCH" | "DELETE";
}

interface SCIMDemoWorkflowOptions<
	Options extends BetterAuthOptions = BetterAuthOptions,
> {
	baseURL: string;
	database: Pick<DBAdapter<Options>, "deleteMany" | "findOne" | "transaction">;
	onCheckpoint(checkpoint: SCIMDemoCheckpoint): void | Promise<void>;
}

interface SCIMDemoStep<T> {
	detail: string;
	status: number;
	value: T;
}

type SCIMDemoRequestError = Error & { status?: number };
type SCIMDemoWorkflowError = Error & {
	scimDemoStep: SCIMDemoCheckpointId;
	status: number;
};

const stepDefinitions: Record<
	SCIMDemoCheckpointId,
	Pick<SCIMDemoCheckpoint, "id" | "label" | "method" | "resource">
> = {
	discovery: {
		id: "discovery",
		label: "Discover service",
		method: "GET",
		resource: "/ServiceProviderConfig",
	},
	authentication: {
		id: "authentication",
		label: "Reject unauthenticated request",
		method: "GET",
		resource: "/Users",
	},
	"provision-user": {
		id: "provision-user",
		label: "Provision user",
		method: "POST",
		resource: "/Users",
	},
	"create-group": {
		id: "create-group",
		label: "Create group",
		method: "POST",
		resource: "/Groups",
	},
	"assign-role": {
		id: "assign-role",
		label: "Assign group role",
		method: "PATCH",
		resource: "/Groups/:id",
	},
	"deactivate-user": {
		id: "deactivate-user",
		label: "Deactivate user",
		method: "PATCH",
		resource: "/Users/:id",
	},
	"reactivate-user": {
		id: "reactivate-user",
		label: "Reactivate user",
		method: "PATCH",
		resource: "/Users/:id",
	},
	"delete-user": {
		id: "delete-user",
		label: "Delete SCIM user",
		method: "DELETE",
		resource: "/Users/:id",
	},
	"reprovision-user": {
		id: "reprovision-user",
		label: "Reprovision user",
		method: "POST",
		resource: "/Users",
	},
	cleanup: {
		id: "cleanup",
		label: "Clean up",
		method: "DELETE",
		resource: "/Groups/:id and /Users/:id",
	},
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

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "The SCIM workflow failed";
}

function getErrorStatus(error: unknown) {
	if (
		error instanceof Error &&
		"status" in error &&
		typeof error.status === "number"
	) {
		return error.status;
	}
	return 500;
}

function createWorkflowError(
	step: SCIMDemoCheckpointId,
	error: unknown,
): SCIMDemoWorkflowError {
	const workflowError = new Error(
		getErrorMessage(error),
	) as SCIMDemoWorkflowError;
	workflowError.scimDemoStep = step;
	workflowError.status = getErrorStatus(error);
	return workflowError;
}

function getSCIMDemoToken() {
	const token = process.env.SCIM_DEMO_TOKEN;
	if (!token) {
		throw new Error("SCIM_DEMO_TOKEN is not configured");
	}
	return token;
}

export function isSCIMDemoEnabled() {
	return (
		process.env.SCIM_DEMO_ENABLED === "true" &&
		Boolean(process.env.SCIM_DEMO_TOKEN) &&
		Boolean(process.env.BETTER_AUTH_URL)
	);
}

export function getSCIMDemoBaseURL() {
	const value = process.env.BETTER_AUTH_URL;
	if (!value) {
		throw new Error("BETTER_AUTH_URL is required for the SCIM demo");
	}

	const url = new URL(value);
	const isLoopback =
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname === "[::1]";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new Error(
			"BETTER_AUTH_URL must use HTTPS unless the SCIM demo runs on loopback",
		);
	}
	return url.origin;
}

export function createSCIMDemoPlugin() {
	if (!isSCIMDemoEnabled()) return disabledSCIMDemoPlugin;

	return scim({
		connections: [
			{
				id: SCIM_DEMO_CONNECTION_ID,
				provisioningDomainId: SCIM_DEMO_PROVISIONING_DOMAIN_ID,
				credentials: [{ type: "bearer", token: getSCIMDemoToken() }],
			},
		],
		identity: {
			async reconcileUser({ userId, active }, { database }) {
				const user = await database.update<SCIMDemoUserRow>({
					model: "user",
					where: [{ field: "id", value: userId }],
					update: { scimDemoActive: active },
				});
				if (!user)
					throw new Error("The provisioned application user is missing");
			},
		},
		projection: {
			roles: {
				map: ({ source }) =>
					source.externalId?.endsWith("-finance-admins")
						? [SCIM_DEMO_ROLE]
						: [],
				exists: ({ role }) => role === SCIM_DEMO_ROLE,
			},
			async reconcileUser({ userId, grants }, { database }) {
				const user = await database.update<SCIMDemoUserRow>({
					model: "user",
					where: [{ field: "id", value: userId }],
					update: {
						scimDemoRole:
							grants.find((grant) => grant.role === SCIM_DEMO_ROLE)?.role ??
							null,
					},
				});
				if (!user)
					throw new Error("The provisioned application user is missing");
			},
		},
	});
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

	const response = await fetch(new URL(`${SCIM_BASE_PATH}${path}`, baseURL), {
		method: options.method ?? "GET",
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		cache: "no-store",
		redirect: "error",
	});
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

async function readApplicationState(
	database: Pick<DBAdapter, "findOne">,
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
	const user = await database.findOne<SCIMDemoUserRow>({
		model: "user",
		where: [{ field: "id", value: scimUser.userId }],
	});
	if (!user) throw new Error("The application user was not persisted");
	return { scimUser, user };
}

async function requireApplicationUser(
	database: Pick<DBAdapter, "findOne">,
	userId: string,
) {
	const user = await database.findOne<SCIMDemoUserRow>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
	if (!user) throw new Error("The application user was unexpectedly deleted");
	return user;
}

function assertState(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function runStep<T>(
	id: SCIMDemoCheckpointId,
	onCheckpoint: SCIMDemoWorkflowOptions["onCheckpoint"],
	operation: () => Promise<SCIMDemoStep<T>>,
) {
	const definition = stepDefinitions[id];
	try {
		const result = await operation();
		await onCheckpoint({
			...definition,
			status: result.status,
			detail: result.detail,
			state: "passed",
		});
		return result.value;
	} catch (error) {
		const workflowError = createWorkflowError(id, error);
		await onCheckpoint({
			...definition,
			status: workflowError.status,
			detail: workflowError.message,
			state: "failed",
		});
		throw workflowError;
	}
}

async function cleanupResource(
	baseURL: string,
	resource: "Groups" | "Users",
	id: string | undefined,
) {
	if (!id) return;
	await requestSCIM(baseURL, `/${resource}/${encodeURIComponent(id)}`, {
		method: "DELETE",
		expectedStatus: [204, 404],
	});
}

async function findDemoGroupId(
	database: Pick<DBAdapter, "findOne">,
	externalId: string,
) {
	const group = await database.findOne<SCIMGroupRow>({
		model: "scimGroup",
		where: [
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
			{ field: "externalId", value: externalId },
		],
	});
	return group?.id;
}

async function findDemoSCIMUser(
	database: Pick<DBAdapter, "findOne">,
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

async function findDemoApplicationUserId(
	database: Pick<DBAdapter, "findOne">,
	externalId: string,
) {
	const tombstone = await database.findOne<SCIMIdentityTombstoneRow>({
		model: "scimIdentityTombstone",
		where: [
			{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
			{ field: "externalId", value: externalId },
		],
	});
	return tombstone?.userId;
}

async function cleanupDemoApplicationUser<Options extends BetterAuthOptions>(
	database: Pick<DBAdapter<Options>, "deleteMany" | "findOne" | "transaction">,
	userId: string,
) {
	return database.transaction(async (transaction) => {
		const liveSCIMUser = await transaction.findOne<SCIMUserRow>({
			model: "scimUser",
			where: [{ field: "userId", value: userId }],
		});
		if (liveSCIMUser) {
			throw new Error("The demo application user still has a SCIM resource");
		}

		const tombstones = await transaction.deleteMany({
			model: "scimIdentityTombstone",
			where: [{ field: "userId", value: userId }],
		});
		const subjects = await transaction.deleteMany({
			model: "scimSubject",
			where: [{ field: "userId", value: userId }],
		});
		const users = await transaction.deleteMany({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		return { subjects, tombstones, users };
	});
}

export function getSCIMDemoFailure(error: unknown) {
	if (
		error instanceof Error &&
		"scimDemoStep" in error &&
		typeof error.scimDemoStep === "string"
	) {
		return { step: error.scimDemoStep, message: error.message };
	}
	return { step: "request", message: getErrorMessage(error) };
}

export async function runSCIMDemoWorkflow<Options extends BetterAuthOptions>({
	baseURL,
	database,
	onCheckpoint,
}: SCIMDemoWorkflowOptions<Options>) {
	const runId = crypto.randomUUID();
	const userExternalId = `${runId}-directory-user`;
	const groupExternalId = `${runId}-finance-admins`;
	const userName = `scim-${runId}@example.com`;
	const userBody = {
		schemas: [SCIM_USER_SCHEMA],
		externalId: userExternalId,
		userName,
		displayName: "Ada Lovelace",
		name: {
			formatted: "Ada Lovelace",
			givenName: "Ada",
			familyName: "Lovelace",
		},
		emails: [{ value: userName, type: "work", primary: true }],
		active: true,
	};

	let applicationUserId: string | undefined;
	let groupId: string | undefined;
	let scimUserId: string | undefined;
	let initialSCIMUserId: string | undefined;
	let workflowFailed = false;

	try {
		await runStep("discovery", onCheckpoint, async () => {
			const response = await requestSCIM(baseURL, "/ServiceProviderConfig", {
				authenticated: false,
				expectedStatus: 200,
			});
			const config = requireRecord(response.body, "ServiceProviderConfig");
			const patch = requireRecord(config.patch, "ServiceProviderConfig.patch");
			const filter = requireRecord(
				config.filter,
				"ServiceProviderConfig.filter",
			);
			assertState(
				patch.supported === true && filter.supported === true,
				"SCIM discovery did not advertise PATCH and filter support",
			);
			return {
				value: undefined,
				status: response.status,
				detail: "PATCH and filter support confirmed",
			};
		});

		await runStep("authentication", onCheckpoint, async () => {
			const response = await requestSCIM(baseURL, "/Users", {
				authenticated: false,
				expectedStatus: 401,
			});
			assertState(
				readSCIMErrorDetail(response.body) !== undefined,
				"Unauthenticated request did not return a SCIM error",
			);
			return {
				value: undefined,
				status: response.status,
				detail: "Missing bearer credential rejected",
			};
		});

		const provisioned = await runStep(
			"provision-user",
			onCheckpoint,
			async () => {
				const response = await requestSCIM(baseURL, "/Users", {
					method: "POST",
					body: userBody,
					expectedStatus: 201,
				});
				const user = readSCIMUser(response.body);
				const state = await readApplicationState(database, user.id);
				assertState(
					user.externalId === userExternalId,
					"externalId was not kept",
				);
				assertState(user.active, "Provisioned SCIM User is not active");
				assertState(
					state.user.scimDemoActive === true,
					"Application access was not enabled",
				);
				assertState(
					(state.user.scimDemoRole ?? null) === null,
					"Application role was granted before Group membership",
				);
				return {
					value: { user, applicationUserId: state.scimUser.userId },
					status: response.status,
					detail: "Application user provisioned without an organization",
				};
			},
		);
		scimUserId = provisioned.user.id;
		initialSCIMUserId = provisioned.user.id;
		applicationUserId = provisioned.applicationUserId;

		groupId = await runStep("create-group", onCheckpoint, async () => {
			const response = await requestSCIM(baseURL, "/Groups", {
				method: "POST",
				body: {
					schemas: [SCIM_GROUP_SCHEMA],
					externalId: groupExternalId,
					displayName: "Finance administrators",
					members: [],
				},
				expectedStatus: 201,
			});
			const group = readSCIMGroup(response.body);
			assertState(
				group.externalId === groupExternalId,
				"externalId was not kept",
			);
			assertState(group.members.length === 0, "New SCIM Group is not empty");
			return {
				value: group.id,
				status: response.status,
				detail: "Finance administrators group created",
			};
		});

		await runStep("assign-role", onCheckpoint, async () => {
			assertState(groupId && scimUserId, "SCIM resources are missing");
			const response = await requestSCIM(
				baseURL,
				`/Groups/${encodeURIComponent(groupId)}`,
				{
					method: "PATCH",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [
							{
								op: "Add",
								path: "members",
								value: [{ value: scimUserId }],
							},
						],
					},
					expectedStatus: 204,
				},
			);
			const groupResponse = await requestSCIM(
				baseURL,
				`/Groups/${encodeURIComponent(groupId)}`,
				{ expectedStatus: 200 },
			);
			const group = readSCIMGroup(groupResponse.body);
			const state = await readApplicationState(database, scimUserId);
			assertState(
				group.members.some((member) => member.value === scimUserId),
				"SCIM Group membership was not persisted",
			);
			assertState(
				state.user.scimDemoRole === SCIM_DEMO_ROLE,
				"Custom application role was not reconciled",
			);
			return {
				value: undefined,
				status: response.status,
				detail: `Custom role ${SCIM_DEMO_ROLE} applied`,
			};
		});

		await runStep("deactivate-user", onCheckpoint, async () => {
			assertState(groupId && scimUserId, "SCIM resources are missing");
			const response = await requestSCIM(
				baseURL,
				`/Users/${encodeURIComponent(scimUserId)}`,
				{
					method: "PATCH",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "Replace", path: "active", value: false }],
					},
					expectedStatus: 204,
				},
			);
			const [userResponse, groupResponse] = await Promise.all([
				requestSCIM(baseURL, `/Users/${encodeURIComponent(scimUserId)}`, {
					expectedStatus: 200,
				}),
				requestSCIM(baseURL, `/Groups/${encodeURIComponent(groupId)}`, {
					expectedStatus: 200,
				}),
			]);
			const user = readSCIMUser(userResponse.body);
			const group = readSCIMGroup(groupResponse.body);
			const state = await readApplicationState(database, scimUserId);
			assertState(!user.active, "SCIM User was not deactivated");
			assertState(
				group.members.some((member) => member.value === scimUserId),
				"Deactivation removed SCIM Group membership",
			);
			assertState(
				state.user.scimDemoActive === false &&
					(state.user.scimDemoRole ?? null) === null,
				"Application access was not disabled",
			);
			return {
				value: undefined,
				status: response.status,
				detail: "Membership retained; application access disabled",
			};
		});

		await runStep("reactivate-user", onCheckpoint, async () => {
			assertState(groupId && scimUserId, "SCIM resources are missing");
			const response = await requestSCIM(
				baseURL,
				`/Users/${encodeURIComponent(scimUserId)}`,
				{
					method: "PATCH",
					body: {
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "Replace", path: "active", value: true }],
					},
					expectedStatus: 204,
				},
			);
			const groupResponse = await requestSCIM(
				baseURL,
				`/Groups/${encodeURIComponent(groupId)}`,
				{ expectedStatus: 200 },
			);
			const group = readSCIMGroup(groupResponse.body);
			const state = await readApplicationState(database, scimUserId);
			assertState(
				group.members.some((member) => member.value === scimUserId),
				"Reactivation did not retain SCIM Group membership",
			);
			assertState(
				state.user.scimDemoActive === true &&
					state.user.scimDemoRole === SCIM_DEMO_ROLE,
				"Application access was not restored",
			);
			return {
				value: undefined,
				status: response.status,
				detail: "Membership retained; custom role restored",
			};
		});

		await runStep("delete-user", onCheckpoint, async () => {
			assertState(
				groupId && scimUserId && applicationUserId,
				"SCIM resources are missing",
			);
			const deletedSCIMUserId = scimUserId;
			const response = await requestSCIM(
				baseURL,
				`/Users/${encodeURIComponent(deletedSCIMUserId)}`,
				{ method: "DELETE", expectedStatus: 204 },
			);
			const [missingUser, groupResponse, applicationUser, tombstone] =
				await Promise.all([
					requestSCIM(
						baseURL,
						`/Users/${encodeURIComponent(deletedSCIMUserId)}`,
						{ expectedStatus: 404 },
					),
					requestSCIM(baseURL, `/Groups/${encodeURIComponent(groupId)}`, {
						expectedStatus: 200,
					}),
					requireApplicationUser(database, applicationUserId),
					database.findOne<SCIMIdentityTombstoneRow>({
						model: "scimIdentityTombstone",
						where: [
							{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
							{ field: "externalId", value: userExternalId },
						],
					}),
				]);
			const group = readSCIMGroup(groupResponse.body);
			assertState(
				readSCIMErrorDetail(missingUser.body) !== undefined,
				"Deleted SCIM User did not return a SCIM error",
			);
			assertState(group.members.length === 0, "Deleted User remained in Group");
			assertState(
				applicationUser.scimDemoActive === false &&
					(applicationUser.scimDemoRole ?? null) === null,
				"Deleted SCIM User retained application access",
			);
			assertState(
				tombstone?.userId === applicationUserId,
				"Stable identity was not retained for reprovisioning",
			);
			scimUserId = undefined;
			return {
				value: undefined,
				status: response.status,
				detail: "SCIM resource removed; application user retained",
			};
		});

		scimUserId = await runStep("reprovision-user", onCheckpoint, async () => {
			assertState(
				applicationUserId && initialSCIMUserId,
				"Original application identity is missing",
			);
			const response = await requestSCIM(baseURL, "/Users", {
				method: "POST",
				body: userBody,
				expectedStatus: 201,
			});
			const user = readSCIMUser(response.body);
			const state = await readApplicationState(database, user.id);
			const tombstone = await database.findOne<SCIMIdentityTombstoneRow>({
				model: "scimIdentityTombstone",
				where: [
					{ field: "connectionId", value: SCIM_DEMO_CONNECTION_ID },
					{ field: "externalId", value: userExternalId },
				],
			});
			assertState(user.id !== initialSCIMUserId, "SCIM resource id was reused");
			assertState(
				state.scimUser.userId === applicationUserId,
				"Reprovisioning created a second application user",
			);
			assertState(
				state.user.scimDemoActive === true &&
					(state.user.scimDemoRole ?? null) === null,
				"Reprovisioned application state is incorrect",
			);
			assertState(!tombstone, "Stable identity tombstone was not consumed");
			return {
				value: user.id,
				status: response.status,
				detail: "Same application user restored with a new SCIM resource",
			};
		});

		await runStep("cleanup", onCheckpoint, async () => {
			assertState(
				groupId && scimUserId && applicationUserId,
				"SCIM resources are missing",
			);
			const deletedGroupId = groupId;
			const deletedSCIMUserId = scimUserId;
			const groupResponse = await requestSCIM(
				baseURL,
				`/Groups/${encodeURIComponent(deletedGroupId)}`,
				{ method: "DELETE", expectedStatus: 204 },
			);
			groupId = undefined;
			await requestSCIM(
				baseURL,
				`/Users/${encodeURIComponent(deletedSCIMUserId)}`,
				{ method: "DELETE", expectedStatus: 204 },
			);
			scimUserId = undefined;
			const [missingGroup, missingUser] = await Promise.all([
				requestSCIM(baseURL, `/Groups/${encodeURIComponent(deletedGroupId)}`, {
					expectedStatus: 404,
				}),
				requestSCIM(
					baseURL,
					`/Users/${encodeURIComponent(deletedSCIMUserId)}`,
					{ expectedStatus: 404 },
				),
			]);
			assertState(
				readSCIMErrorDetail(missingGroup.body) !== undefined &&
					readSCIMErrorDetail(missingUser.body) !== undefined,
				"Temporary SCIM resources remain",
			);
			const deletedRecords = await cleanupDemoApplicationUser(
				database,
				applicationUserId,
			);
			assertState(
				deletedRecords.tombstones === 1 &&
					deletedRecords.subjects === 1 &&
					deletedRecords.users === 1,
				"Temporary application records were not removed",
			);
			return {
				value: undefined,
				status: groupResponse.status,
				detail: "Temporary demo records removed",
			};
		});
	} catch (error) {
		workflowFailed = true;
		throw error;
	} finally {
		const cleanupErrors: unknown[] = [];
		const attemptCleanup = async <T>(operation: () => Promise<T>) => {
			try {
				return await operation();
			} catch (error) {
				cleanupErrors.push(error);
				return undefined;
			}
		};

		const persistedGroupId = await attemptCleanup(() =>
			findDemoGroupId(database, groupExternalId),
		);
		await attemptCleanup(() =>
			cleanupResource(baseURL, "Groups", groupId ?? persistedGroupId),
		);

		const persistedSCIMUser = await attemptCleanup(() =>
			findDemoSCIMUser(database, userExternalId),
		);
		const tombstoneUserId = await attemptCleanup(() =>
			findDemoApplicationUserId(database, userExternalId),
		);
		const demoApplicationUserId =
			applicationUserId ?? persistedSCIMUser?.userId ?? tombstoneUserId;
		await attemptCleanup(() =>
			cleanupResource(baseURL, "Users", scimUserId ?? persistedSCIMUser?.id),
		);
		if (demoApplicationUserId) {
			await attemptCleanup(() =>
				cleanupDemoApplicationUser(database, demoApplicationUserId),
			);
		}

		if (cleanupErrors.length > 0) {
			const cleanupError = new AggregateError(
				cleanupErrors,
				`SCIM demo cleanup failed for run ${runId}`,
			);
			if (!workflowFailed) throw cleanupError;
			console.error(
				"SCIM demo cleanup failed after a workflow error",
				cleanupError,
			);
		}
	}
}
