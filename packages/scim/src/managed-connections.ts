import { getCurrentAdapter } from "@better-auth/core/context";
import { createHMAC } from "@better-auth/utils/hmac";
import type { DBAdapter, DBTransactionAdapter } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import * as z from "zod";
import type {
	SCIMManagedConnectionOptions,
	SCIMPrincipal,
	SCIMScope,
} from "./configuration";
import { decommissionSCIMConnection } from "./connection-decommission";
import type { SCIMIdentityCoordinator } from "./identity";
import type { SCIMProjectionCoordinator } from "./projection";

export const SCIM_MANAGED_CONNECTION_ID_PREFIX = "ba_scim_connection_";
const SCIM_MANAGED_CREDENTIAL_ID_PREFIX = "ba_scim_credential_";
/** Error code returned when a managed connection creation request ID is reused. */
export const SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT =
	"SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT";

const SCIM_MANAGED_HASH_VERSION = "v1";
const SCIM_MANAGED_EVENT_LIMIT = 100;
const SCIM_MANAGED_DEFAULT_MAX_ACTIVE_CREDENTIALS = 5;
const SCIM_MANAGED_DEFAULT_LAST_USED_WRITE_INTERVAL_SECONDS = 300;
const SCIM_MANAGED_ACTIVE_CREDENTIAL_SCAN_LIMIT = 101;
const SCIM_MANAGED_IDENTIFIER_LENGTH = 32;
const SCIM_MANAGED_SECRET_LENGTH = 48;

const scimScopeSchema = z.enum([
	"scim.users.read",
	"scim.users.write",
	"scim.groups.read",
	"scim.groups.write",
]);
const creationRequestIdSchema = z.string().trim().min(16).max(255);
const provisioningDomainIdSchema = z.string().trim().min(1).max(255);
const connectionIdSchema = z
	.string()
	.startsWith(SCIM_MANAGED_CONNECTION_ID_PREFIX)
	.max(255);
const credentialIdSchema = z
	.string()
	.startsWith(SCIM_MANAGED_CREDENTIAL_ID_PREFIX)
	.max(255);
const actorIdSchema = z.string().trim().min(1).max(255);
const credentialPolicySchema = {
	scopes: z.array(scimScopeSchema).min(1).readonly(),
	expiresAt: z.date(),
};

const createManagedConnectionBodySchema = z.object({
	creationRequestId: creationRequestIdSchema,
	provisioningDomainId: provisioningDomainIdSchema,
	actorId: actorIdSchema,
	...credentialPolicySchema,
});
const listManagedConnectionsBodySchema = z.object({
	provisioningDomainId: provisioningDomainIdSchema,
});
const getManagedConnectionBodySchema = z.object({
	connectionId: connectionIdSchema,
	provisioningDomainId: provisioningDomainIdSchema,
});
const rotateManagedCredentialBodySchema = z.object({
	connectionId: connectionIdSchema,
	provisioningDomainId: provisioningDomainIdSchema,
	actorId: actorIdSchema,
	...credentialPolicySchema,
});
const revokeManagedCredentialBodySchema = z.object({
	connectionId: connectionIdSchema,
	provisioningDomainId: provisioningDomainIdSchema,
	credentialId: credentialIdSchema,
	actorId: actorIdSchema,
});
const decommissionManagedConnectionBodySchema = z.object({
	connectionId: connectionIdSchema,
	provisioningDomainId: provisioningDomainIdSchema,
	actorId: actorIdSchema,
});

type CreateManagedConnectionInput = z.infer<
	typeof createManagedConnectionBodySchema
>;
type RotateManagedCredentialInput = z.infer<
	typeof rotateManagedCredentialBodySchema
>;
type RevokeManagedCredentialInput = z.infer<
	typeof revokeManagedCredentialBodySchema
>;
type DecommissionManagedConnectionInput = z.infer<
	typeof decommissionManagedConnectionBodySchema
>;

/** Lifecycle state for a framework-managed SCIM connection. */
export type SCIMManagedConnectionStatus =
	| "active"
	| "decommissioning"
	| "decommissioned";

/** Lifecycle state for a framework-managed SCIM credential. */
export type SCIMManagedCredentialStatus =
	| "active"
	| "expired"
	| "revoked"
	| "decommissioned";

interface ManagedConnectionRow {
	id: string;
	creationRequestId: string;
	connectionId: string;
	provisioningDomainId: string;
	status: SCIMManagedConnectionStatus;
	revision: number;
	createdAt: Date;
	createdBy: string;
	decommissionStartedAt?: Date | null;
	decommissionStartedBy?: string | null;
	decommissionedAt?: Date | null;
	decommissionedBy?: string | null;
}

interface ManagedCredentialRow {
	id: string;
	connectionRecordId: string;
	credentialId: string;
	tokenDigest: string;
	hashVersion: string;
	activeSlotKey: string;
	status: SCIMManagedCredentialStatus;
	serializedScopes: string;
	expiresAt: Date;
	createdAt: Date;
	createdBy: string;
	lastUsedAt?: Date | null;
	revokedAt?: Date | null;
	revokedBy?: string | null;
	decommissionedAt?: Date | null;
}

export type SCIMManagedConnectionEventType =
	| "connection.created"
	| "credential.issued"
	| "credential.rotated"
	| "credential.revoked"
	| "connection.decommissioning"
	| "connection.decommissioned";

interface ManagedConnectionEventRow {
	id: string;
	connectionRecordId: string;
	eventKey: string;
	sequence: number;
	type: SCIMManagedConnectionEventType;
	actorId: string;
	credentialId?: string | null;
	createdAt: Date;
}

/** Public state for one framework-managed SCIM connection. */
export interface SCIMManagedConnection {
	/**
	 * Immutable application-supplied correlation for the logical creation
	 * operation. It identifies ownership during recovery; it does not replay a
	 * credential or make creation idempotent.
	 */
	creationRequestId: string;
	connectionId: string;
	provisioningDomainId: string;
	status: SCIMManagedConnectionStatus;
	createdAt: Date;
	createdBy: string;
	decommissionStartedAt: Date | null;
	decommissionStartedBy: string | null;
	decommissionedAt: Date | null;
	decommissionedBy: string | null;
}

/** Public state for one framework-managed SCIM credential. */
export interface SCIMManagedCredential {
	credentialId: string;
	status: SCIMManagedCredentialStatus;
	scopes: readonly SCIMScope[];
	expiresAt: Date;
	createdAt: Date;
	createdBy: string;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
	revokedBy: string | null;
}

/** One bounded audit event emitted by the managed SCIM catalog. */
export interface SCIMManagedConnectionEvent {
	sequence: number;
	type: SCIMManagedConnectionEventType;
	actorId: string;
	credentialId: string | null;
	createdAt: Date;
}

interface ResolvedManagedConnectionOptions {
	credentialHashSecret: string;
	maxActiveCredentials: number;
	lastUsedWriteIntervalSeconds: number;
}

type ManagedReadDatabase = Pick<DBAdapter, "findMany" | "findOne">;
type ManagedTransactionDatabase = Pick<
	DBTransactionAdapter,
	"create" | "findMany" | "findOne" | "incrementOne" | "update" | "updateMany"
>;

function createManagedNotFoundError(): APIError {
	return new APIError("NOT_FOUND", {
		message: "Managed SCIM connection not found",
	});
}

function createManagedConflictError(message: string): APIError {
	return new APIError("CONFLICT", { message });
}

function createManagedCreationRequestConflictError(): APIError {
	return new APIError("CONFLICT", {
		code: SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT,
		message: "Managed SCIM connection creation request ID already exists",
	});
}

function createActiveSlotKey(
	connectionRecordId: string,
	slotIndex: number,
): string {
	return `${connectionRecordId}:active:${slotIndex}`;
}

function createInactiveSlotKey(credentialId: string): string {
	return `${credentialId}:inactive`;
}

function assertFutureExpiry(expiresAt: Date): void {
	if (expiresAt.getTime() <= Date.now()) {
		throw new APIError("BAD_REQUEST", {
			message: "Managed SCIM credential expiry must be in the future",
		});
	}
}

function generateOpaqueIdentifier(prefix: string): string {
	return `${prefix}${generateRandomString(
		SCIM_MANAGED_IDENTIFIER_LENGTH,
		"a-z",
		"A-Z",
		"0-9",
		"-_",
	)}`;
}

function createManagedToken(credentialId: string): string {
	const secret = generateRandomString(
		SCIM_MANAGED_SECRET_LENGTH,
		"a-z",
		"A-Z",
		"0-9",
		"-_",
	);
	return `${credentialId}.${secret}`;
}

async function digestManagedToken(
	token: string,
	options: ResolvedManagedConnectionOptions,
): Promise<string> {
	return await createHMAC("SHA-256", "base64urlnopad").sign(
		options.credentialHashSecret,
		token,
	);
}

function parseManagedScopes(serializedScopes: string): readonly SCIMScope[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(serializedScopes);
	} catch {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Managed SCIM credential scope policy is invalid",
		});
	}
	const result = z.array(scimScopeSchema).min(1).safeParse(parsed);
	if (!result.success || new Set(result.data).size !== result.data.length) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Managed SCIM credential scope policy is invalid",
		});
	}
	return result.data;
}

function toManagedConnection(
	connection: ManagedConnectionRow,
): SCIMManagedConnection {
	return {
		creationRequestId: connection.creationRequestId,
		connectionId: connection.connectionId,
		provisioningDomainId: connection.provisioningDomainId,
		status: connection.status,
		createdAt: connection.createdAt,
		createdBy: connection.createdBy,
		decommissionStartedAt: connection.decommissionStartedAt ?? null,
		decommissionStartedBy: connection.decommissionStartedBy ?? null,
		decommissionedAt: connection.decommissionedAt ?? null,
		decommissionedBy: connection.decommissionedBy ?? null,
	};
}

function toManagedCredential(
	credential: ManagedCredentialRow,
	observedAt = new Date(),
): SCIMManagedCredential {
	return {
		credentialId: credential.credentialId,
		status:
			credential.status === "active" &&
			credential.expiresAt.getTime() <= observedAt.getTime()
				? "expired"
				: credential.status,
		scopes: parseManagedScopes(credential.serializedScopes),
		expiresAt: credential.expiresAt,
		createdAt: credential.createdAt,
		createdBy: credential.createdBy,
		lastUsedAt: credential.lastUsedAt ?? null,
		revokedAt: credential.revokedAt ?? null,
		revokedBy: credential.revokedBy ?? null,
	};
}

async function findManagedConnectionByCreationRequestId(
	database: Pick<DBAdapter, "findOne">,
	creationRequestId: string,
): Promise<ManagedConnectionRow | null> {
	return await database.findOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [{ field: "creationRequestId", value: creationRequestId }],
	});
}

async function findManagedConnection(
	database: ManagedReadDatabase,
	connectionId: string,
	provisioningDomainId: string,
): Promise<ManagedConnectionRow | null> {
	return await database.findOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [
			{ field: "connectionId", value: connectionId },
			{ field: "provisioningDomainId", value: provisioningDomainId },
		],
	});
}

async function getManagedConnectionState(
	database: ManagedReadDatabase,
	connection: ManagedConnectionRow,
): Promise<{
	connection: SCIMManagedConnection;
	credentials: SCIMManagedCredential[];
}> {
	const credentials = await database.findMany<ManagedCredentialRow>({
		model: "scimManagedCredential",
		where: [{ field: "connectionRecordId", value: connection.id }],
		sortBy: { field: "createdAt", direction: "desc" },
	});
	return {
		connection: toManagedConnection(connection),
		credentials: credentials.map((credential) =>
			toManagedCredential(credential),
		),
	};
}

async function createManagedEvent(
	database: Pick<ManagedTransactionDatabase, "create">,
	input: {
		connectionRecordId: string;
		sequence: number;
		type: SCIMManagedConnectionEventType;
		actorId: string;
		credentialId?: string;
		createdAt: Date;
	},
): Promise<void> {
	await database.create<
		Omit<ManagedConnectionEventRow, "id">,
		ManagedConnectionEventRow
	>({
		model: "scimManagedConnectionEvent",
		data: {
			connectionRecordId: input.connectionRecordId,
			eventKey: `${input.connectionRecordId}:${input.sequence}`,
			sequence: input.sequence,
			type: input.type,
			actorId: input.actorId,
			...(input.credentialId ? { credentialId: input.credentialId } : {}),
			createdAt: input.createdAt,
		},
	});
}

async function runManagedMutationTransaction<Result>(
	baseAdapter: DBAdapter,
	mutation: (database: ManagedTransactionDatabase) => Promise<Result>,
): Promise<Result> {
	const currentAdapter = await getCurrentAdapter(baseAdapter);
	if (currentAdapter !== baseAdapter) {
		return await mutation(currentAdapter);
	}
	return await baseAdapter.transaction(async (transaction) => {
		return await mutation(transaction);
	});
}

async function createManagedConnectionInCurrentTransaction(
	database: ManagedTransactionDatabase,
	input: CreateManagedConnectionInput,
	generated: {
		connectionId: string;
		credentialId: string;
		tokenDigest: string;
		createdAt: Date;
	},
): Promise<{
	connection: ManagedConnectionRow;
	credential: ManagedCredentialRow;
}> {
	if (
		await findManagedConnectionByCreationRequestId(
			database,
			input.creationRequestId,
		)
	) {
		throw createManagedCreationRequestConflictError();
	}
	const connection = await database.create<
		Omit<ManagedConnectionRow, "id">,
		ManagedConnectionRow
	>({
		model: "scimManagedConnection",
		data: {
			creationRequestId: input.creationRequestId,
			connectionId: generated.connectionId,
			provisioningDomainId: input.provisioningDomainId,
			status: "active",
			revision: 2,
			createdAt: generated.createdAt,
			createdBy: input.actorId,
		},
	});
	const credential = await database.create<
		Omit<ManagedCredentialRow, "id">,
		ManagedCredentialRow
	>({
		model: "scimManagedCredential",
		data: {
			connectionRecordId: connection.id,
			credentialId: generated.credentialId,
			tokenDigest: generated.tokenDigest,
			hashVersion: SCIM_MANAGED_HASH_VERSION,
			activeSlotKey: createActiveSlotKey(connection.id, 0),
			status: "active",
			serializedScopes: JSON.stringify(input.scopes),
			expiresAt: input.expiresAt,
			createdAt: generated.createdAt,
			createdBy: input.actorId,
		},
	});
	await createManagedEvent(database, {
		connectionRecordId: connection.id,
		sequence: 1,
		type: "connection.created",
		actorId: input.actorId,
		createdAt: generated.createdAt,
	});
	await createManagedEvent(database, {
		connectionRecordId: connection.id,
		sequence: 2,
		type: "credential.issued",
		actorId: input.actorId,
		credentialId: generated.credentialId,
		createdAt: generated.createdAt,
	});
	return { connection, credential };
}

async function rotateManagedCredentialInCurrentTransaction(
	database: ManagedTransactionDatabase,
	options: ResolvedManagedConnectionOptions,
	input: RotateManagedCredentialInput,
	generated: {
		credentialId: string;
		tokenDigest: string;
		createdAt: Date;
	},
): Promise<{
	connection: ManagedConnectionRow;
	credential: ManagedCredentialRow;
} | null> {
	const connection = await findManagedConnection(
		database,
		input.connectionId,
		input.provisioningDomainId,
	);
	if (!connection) throw createManagedNotFoundError();
	if (connection.status !== "active") {
		throw createManagedConflictError("Managed SCIM connection is not active");
	}
	const fenced = await database.incrementOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [
			{ field: "id", value: connection.id },
			{ field: "status", value: "active" },
			{ field: "revision", value: connection.revision },
		],
		increment: { revision: 1 },
	});
	if (!fenced) return null;

	const activeCredentials = await database.findMany<ManagedCredentialRow>({
		model: "scimManagedCredential",
		where: [
			{ field: "connectionRecordId", value: connection.id },
			{ field: "status", value: "active" },
		],
		limit: SCIM_MANAGED_ACTIVE_CREDENTIAL_SCAN_LIMIT,
	});
	const liveSlotKeys = new Set<string>();
	for (const credential of activeCredentials) {
		if (credential.expiresAt.getTime() <= generated.createdAt.getTime()) {
			await database.update<ManagedCredentialRow>({
				model: "scimManagedCredential",
				where: [
					{ field: "id", value: credential.id },
					{ field: "status", value: "active" },
					{ field: "activeSlotKey", value: credential.activeSlotKey },
				],
				update: {
					status: "expired",
					activeSlotKey: createInactiveSlotKey(credential.credentialId),
				},
			});
		} else {
			liveSlotKeys.add(credential.activeSlotKey);
		}
	}
	if (liveSlotKeys.size >= options.maxActiveCredentials) {
		throw createManagedConflictError(
			"Managed SCIM connection has the maximum number of active credentials",
		);
	}
	let slotIndex: number | undefined;
	for (
		let candidate = 0;
		candidate < options.maxActiveCredentials;
		candidate++
	) {
		if (!liveSlotKeys.has(createActiveSlotKey(connection.id, candidate))) {
			slotIndex = candidate;
			break;
		}
	}
	if (slotIndex === undefined) {
		throw createManagedConflictError(
			"Managed SCIM connection has the maximum number of active credentials",
		);
	}
	const credential = await database.create<
		Omit<ManagedCredentialRow, "id">,
		ManagedCredentialRow
	>({
		model: "scimManagedCredential",
		data: {
			connectionRecordId: connection.id,
			credentialId: generated.credentialId,
			tokenDigest: generated.tokenDigest,
			hashVersion: SCIM_MANAGED_HASH_VERSION,
			activeSlotKey: createActiveSlotKey(connection.id, slotIndex),
			status: "active",
			serializedScopes: JSON.stringify(input.scopes),
			expiresAt: input.expiresAt,
			createdAt: generated.createdAt,
			createdBy: input.actorId,
		},
	});
	await createManagedEvent(database, {
		connectionRecordId: connection.id,
		sequence: fenced.revision,
		type: "credential.rotated",
		actorId: input.actorId,
		credentialId: generated.credentialId,
		createdAt: generated.createdAt,
	});
	return { connection: fenced, credential };
}

async function revokeManagedCredentialInCurrentTransaction(
	database: ManagedTransactionDatabase,
	input: RevokeManagedCredentialInput,
): Promise<ManagedConnectionRow | null> {
	const connection = await findManagedConnection(
		database,
		input.connectionId,
		input.provisioningDomainId,
	);
	if (!connection) throw createManagedNotFoundError();
	const credential = await database.findOne<ManagedCredentialRow>({
		model: "scimManagedCredential",
		where: [
			{ field: "credentialId", value: input.credentialId },
			{ field: "connectionRecordId", value: connection.id },
		],
	});
	if (!credential) throw createManagedNotFoundError();
	if (credential.status === "revoked") return connection;
	if (connection.status !== "active" || credential.status !== "active") {
		throw createManagedConflictError("Managed SCIM credential is not active");
	}
	const fenced = await database.incrementOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [
			{ field: "id", value: connection.id },
			{ field: "status", value: "active" },
			{ field: "revision", value: connection.revision },
		],
		increment: { revision: 1 },
	});
	if (!fenced) return null;
	const revokedAt = new Date();
	const updated = await database.update<ManagedCredentialRow>({
		model: "scimManagedCredential",
		where: [
			{ field: "id", value: credential.id },
			{ field: "status", value: "active" },
			{ field: "activeSlotKey", value: credential.activeSlotKey },
		],
		update: {
			status: "revoked",
			activeSlotKey: createInactiveSlotKey(credential.credentialId),
			revokedAt,
			revokedBy: input.actorId,
		},
	});
	if (!updated) return null;
	await createManagedEvent(database, {
		connectionRecordId: connection.id,
		sequence: fenced.revision,
		type: "credential.revoked",
		actorId: input.actorId,
		credentialId: credential.credentialId,
		createdAt: revokedAt,
	});
	return fenced;
}

async function beginManagedConnectionDecommissionInCurrentTransaction(
	database: ManagedTransactionDatabase,
	input: DecommissionManagedConnectionInput,
): Promise<ManagedConnectionRow | null> {
	const connection = await findManagedConnection(
		database,
		input.connectionId,
		input.provisioningDomainId,
	);
	if (!connection) throw createManagedNotFoundError();
	if (
		connection.status === "decommissioning" ||
		connection.status === "decommissioned"
	) {
		return connection;
	}
	const decommissionStartedAt = new Date();
	const fenced = await database.incrementOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [
			{ field: "id", value: connection.id },
			{ field: "status", value: "active" },
			{ field: "revision", value: connection.revision },
		],
		increment: { revision: 1 },
		set: {
			status: "decommissioning",
			decommissionStartedAt,
			decommissionStartedBy: input.actorId,
		},
	});
	if (!fenced) return null;
	const activeCredentials = await database.findMany<ManagedCredentialRow>({
		model: "scimManagedCredential",
		where: [
			{ field: "connectionRecordId", value: connection.id },
			{ field: "status", value: "active" },
		],
		limit: 100,
	});
	for (const credential of activeCredentials) {
		await database.update<ManagedCredentialRow>({
			model: "scimManagedCredential",
			where: [
				{ field: "id", value: credential.id },
				{ field: "status", value: "active" },
				{ field: "activeSlotKey", value: credential.activeSlotKey },
			],
			update: {
				status: "decommissioned",
				activeSlotKey: createInactiveSlotKey(credential.credentialId),
				decommissionedAt: decommissionStartedAt,
			},
		});
	}
	await createManagedEvent(database, {
		connectionRecordId: connection.id,
		sequence: fenced.revision,
		type: "connection.decommissioning",
		actorId: input.actorId,
		createdAt: decommissionStartedAt,
	});
	return fenced;
}

async function completeManagedConnectionDecommissionInCurrentTransaction(
	database: ManagedTransactionDatabase,
	input: DecommissionManagedConnectionInput,
): Promise<ManagedConnectionRow | null> {
	const connection = await findManagedConnection(
		database,
		input.connectionId,
		input.provisioningDomainId,
	);
	if (!connection) throw createManagedNotFoundError();
	if (connection.status === "decommissioned") return connection;
	if (connection.status !== "decommissioning") {
		throw createManagedConflictError(
			"Managed SCIM connection did not begin decommissioning",
		);
	}
	const decommissionedAt = new Date();
	const fenced = await database.incrementOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [
			{ field: "id", value: connection.id },
			{ field: "status", value: "decommissioning" },
			{ field: "revision", value: connection.revision },
		],
		increment: { revision: 1 },
		set: {
			status: "decommissioned",
			decommissionedAt,
			decommissionedBy: input.actorId,
		},
	});
	if (!fenced) return null;
	await createManagedEvent(database, {
		connectionRecordId: connection.id,
		sequence: fenced.revision,
		type: "connection.decommissioned",
		actorId: input.actorId,
		createdAt: decommissionedAt,
	});
	return fenced;
}

export function resolveManagedConnectionOptions(
	options: SCIMManagedConnectionOptions,
): ResolvedManagedConnectionOptions {
	return {
		credentialHashSecret: options.credentialHashSecret,
		maxActiveCredentials:
			options.maxActiveCredentials ??
			SCIM_MANAGED_DEFAULT_MAX_ACTIVE_CREDENTIALS,
		lastUsedWriteIntervalSeconds:
			options.lastUsedWriteIntervalSeconds ??
			SCIM_MANAGED_DEFAULT_LAST_USED_WRITE_INTERVAL_SECONDS,
	};
}

export function isManagedSCIMBearerToken(token: string): boolean {
	return token.startsWith(SCIM_MANAGED_CREDENTIAL_ID_PREFIX);
}

function parseManagedCredentialId(token: string): string | undefined {
	const match = token.match(
		/^(ba_scim_credential_[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/,
	);
	return match?.[1];
}

export async function verifyManagedSCIMBearerToken(
	database: Pick<DBAdapter, "findOne" | "update">,
	token: string,
	options: ResolvedManagedConnectionOptions,
): Promise<SCIMPrincipal | undefined> {
	const credentialId = parseManagedCredentialId(token);
	if (!credentialId) return;
	const credential = await database.findOne<ManagedCredentialRow>({
		model: "scimManagedCredential",
		where: [{ field: "credentialId", value: credentialId }],
	});
	if (
		!credential ||
		credential.hashVersion !== SCIM_MANAGED_HASH_VERSION ||
		credential.status !== "active" ||
		credential.expiresAt.getTime() <= Date.now()
	) {
		return;
	}
	const validDigest = await createHMAC("SHA-256", "base64urlnopad").verify(
		options.credentialHashSecret,
		token,
		credential.tokenDigest,
	);
	if (!validDigest) return;
	const connection = await database.findOne<ManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [
			{ field: "id", value: credential.connectionRecordId },
			{ field: "status", value: "active" },
		],
	});
	if (!connection) return;

	const now = new Date();
	const lastUsedAt = credential.lastUsedAt ?? null;
	const updateDue =
		!lastUsedAt ||
		lastUsedAt.getTime() + options.lastUsedWriteIntervalSeconds * 1_000 <=
			now.getTime();
	if (updateDue) {
		try {
			await database.update<ManagedCredentialRow>({
				model: "scimManagedCredential",
				where: [
					{ field: "id", value: credential.id },
					{ field: "status", value: "active" },
					{ field: "lastUsedAt", value: lastUsedAt },
				],
				update: { lastUsedAt: now },
			});
		} catch {
			// Last-used accounting is best effort and cannot change authorization.
		}
	}

	return {
		type: "managed-bearer",
		connectionId: connection.connectionId,
		provisioningDomainId: connection.provisioningDomainId,
		credentialId,
		scopes: parseManagedScopes(credential.serializedScopes),
		expiresAt: credential.expiresAt,
	};
}

export function createSCIMManagedConnectionEndpoints(
	configuredOptions: ResolvedManagedConnectionOptions | undefined,
	projection: SCIMProjectionCoordinator,
	identity: SCIMIdentityCoordinator,
) {
	const requireManagedOptions = (): ResolvedManagedConnectionOptions => {
		if (!configuredOptions) {
			throw new APIError("BAD_REQUEST", {
				message: "SCIM managed connections are not configured",
			});
		}
		return configuredOptions;
	};

	return {
		createSCIMManagedConnection: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: createManagedConnectionBodySchema,
				metadata: { noStore: true },
			},
			async (ctx) => {
				const options = requireManagedOptions();
				assertFutureExpiry(ctx.body.expiresAt);
				if (new Set(ctx.body.scopes).size !== ctx.body.scopes.length) {
					throw new APIError("BAD_REQUEST", {
						message: "Managed SCIM credential scopes must be unique",
					});
				}
				const ambientDatabase = await getCurrentAdapter(ctx.context.adapter);
				const joinsAmbientTransaction = ambientDatabase !== ctx.context.adapter;
				const createdAt = new Date();
				const connectionId = generateOpaqueIdentifier(
					SCIM_MANAGED_CONNECTION_ID_PREFIX,
				);
				const credentialId = generateOpaqueIdentifier(
					SCIM_MANAGED_CREDENTIAL_ID_PREFIX,
				);
				const token = createManagedToken(credentialId);
				const tokenDigest = await digestManagedToken(token, options);
				let created: {
					connection: ManagedConnectionRow;
					credential: ManagedCredentialRow;
				};
				try {
					created = await runManagedMutationTransaction(
						ctx.context.adapter,
						async (database) => {
							return await createManagedConnectionInCurrentTransaction(
								database,
								ctx.body,
								{ connectionId, credentialId, tokenDigest, createdAt },
							);
						},
					);
				} catch (error) {
					if (error instanceof APIError) throw error;
					if (joinsAmbientTransaction) throw error;
					const duplicate = await findManagedConnectionByCreationRequestId(
						ctx.context.adapter,
						ctx.body.creationRequestId,
					);
					if (duplicate) {
						throw createManagedCreationRequestConflictError();
					}
					throw error;
				}
				return ctx.json({
					connection: toManagedConnection(created.connection),
					credential: toManagedCredential(created.credential, createdAt),
					token,
				});
			},
		),
		listSCIMManagedConnections: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: listManagedConnectionsBodySchema,
			},
			async (ctx) => {
				requireManagedOptions();
				const database = await getCurrentAdapter(ctx.context.adapter);
				const connections = await database.findMany<ManagedConnectionRow>({
					model: "scimManagedConnection",
					where: [
						{
							field: "provisioningDomainId",
							value: ctx.body.provisioningDomainId,
						},
					],
					sortBy: { field: "createdAt", direction: "desc" },
				});
				return ctx.json({
					connections: connections.map((connection) =>
						toManagedConnection(connection),
					),
				});
			},
		),
		getSCIMManagedConnection: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: getManagedConnectionBodySchema,
			},
			async (ctx) => {
				requireManagedOptions();
				const database = await getCurrentAdapter(ctx.context.adapter);
				const connection = await findManagedConnection(
					database,
					ctx.body.connectionId,
					ctx.body.provisioningDomainId,
				);
				if (!connection) throw createManagedNotFoundError();
				return ctx.json(await getManagedConnectionState(database, connection));
			},
		),
		rotateSCIMManagedCredential: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: rotateManagedCredentialBodySchema,
				metadata: { noStore: true },
			},
			async (ctx) => {
				const options = requireManagedOptions();
				assertFutureExpiry(ctx.body.expiresAt);
				if (new Set(ctx.body.scopes).size !== ctx.body.scopes.length) {
					throw new APIError("BAD_REQUEST", {
						message: "Managed SCIM credential scopes must be unique",
					});
				}
				const createdAt = new Date();
				const credentialId = generateOpaqueIdentifier(
					SCIM_MANAGED_CREDENTIAL_ID_PREFIX,
				);
				const token = createManagedToken(credentialId);
				const tokenDigest = await digestManagedToken(token, options);

				for (let attempt = 0; attempt < 5; attempt++) {
					const rotated = await runManagedMutationTransaction(
						ctx.context.adapter,
						async (database) =>
							await rotateManagedCredentialInCurrentTransaction(
								database,
								options,
								ctx.body,
								{ credentialId, tokenDigest, createdAt },
							),
					);
					if (!rotated) continue;
					return ctx.json({
						connection: toManagedConnection(rotated.connection),
						credential: toManagedCredential(rotated.credential, createdAt),
						token,
					});
				}
				throw createManagedConflictError(
					"Managed SCIM connection changed repeatedly during credential rotation",
				);
			},
		),
		revokeSCIMManagedCredential: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: revokeManagedCredentialBodySchema,
			},
			async (ctx) => {
				requireManagedOptions();
				for (let attempt = 0; attempt < 5; attempt++) {
					const revoked = await runManagedMutationTransaction(
						ctx.context.adapter,
						async (database) =>
							await revokeManagedCredentialInCurrentTransaction(
								database,
								ctx.body,
							),
					);
					if (!revoked) continue;
					const database = await getCurrentAdapter(ctx.context.adapter);
					return ctx.json(await getManagedConnectionState(database, revoked));
				}
				throw createManagedConflictError(
					"Managed SCIM connection changed repeatedly during credential revocation",
				);
			},
		),
		listSCIMManagedConnectionEvents: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: getManagedConnectionBodySchema,
			},
			async (ctx) => {
				requireManagedOptions();
				const database = await getCurrentAdapter(ctx.context.adapter);
				const connection = await findManagedConnection(
					database,
					ctx.body.connectionId,
					ctx.body.provisioningDomainId,
				);
				if (!connection) throw createManagedNotFoundError();
				const events = await database.findMany<ManagedConnectionEventRow>({
					model: "scimManagedConnectionEvent",
					where: [{ field: "connectionRecordId", value: connection.id }],
					limit: SCIM_MANAGED_EVENT_LIMIT,
					sortBy: { field: "sequence", direction: "desc" },
				});
				return ctx.json({
					events: events.reverse().map(
						(event): SCIMManagedConnectionEvent => ({
							sequence: event.sequence,
							type: event.type,
							actorId: event.actorId,
							credentialId: event.credentialId ?? null,
							createdAt: event.createdAt,
						}),
					),
				});
			},
		),
		decommissionSCIMManagedConnection: createAuthEndpoint.serverOnly(
			{
				method: "POST",
				body: decommissionManagedConnectionBodySchema,
			},
			async (ctx) => {
				requireManagedOptions();
				const database = await getCurrentAdapter(ctx.context.adapter);
				let started: ManagedConnectionRow | undefined;
				for (let attempt = 0; attempt < 5; attempt++) {
					const result = await runManagedMutationTransaction(
						ctx.context.adapter,
						async (transaction) =>
							await beginManagedConnectionDecommissionInCurrentTransaction(
								transaction,
								ctx.body,
							),
					);
					if (!result) continue;
					started = result;
					break;
				}
				if (!started) {
					throw createManagedConflictError(
						"Managed SCIM connection changed repeatedly while decommissioning began",
					);
				}
				if (started.status === "decommissioned") {
					return ctx.json({
						...(await getManagedConnectionState(database, started)),
						decommission: {
							status: "complete" as const,
							retryAfter: null,
						},
					});
				}

				const coreResult = await decommissionSCIMConnection({
					database: ctx.context.adapter,
					auth: ctx.context,
					projection,
					identity,
					connectionId: started.connectionId,
					provisioningDomainId: started.provisioningDomainId,
				});
				if (coreResult.status !== "complete") {
					return ctx.json({
						...(await getManagedConnectionState(database, started)),
						decommission: coreResult,
					});
				}

				for (let attempt = 0; attempt < 5; attempt++) {
					const completed = await runManagedMutationTransaction(
						ctx.context.adapter,
						async (transaction) =>
							await completeManagedConnectionDecommissionInCurrentTransaction(
								transaction,
								ctx.body,
							),
					);
					if (!completed) continue;
					return ctx.json({
						...(await getManagedConnectionState(database, completed)),
						decommission: coreResult,
					});
				}
				throw createManagedConflictError(
					"Managed SCIM connection changed repeatedly while decommissioning completed",
				);
			},
		),
	};
}

export const managedSCIMSchema = {
	scimManagedConnection: {
		fields: {
			creationRequestId: {
				type: "string",
				required: true,
				unique: true,
			},
			connectionId: {
				type: "string",
				required: true,
				unique: true,
			},
			provisioningDomainId: {
				type: "string",
				required: true,
				index: true,
			},
			status: { type: "string", required: true },
			revision: {
				type: "number",
				required: true,
				returned: false,
			},
			createdAt: { type: "date", required: true },
			createdBy: { type: "string", required: true },
			decommissionStartedAt: { type: "date", required: false },
			decommissionStartedBy: { type: "string", required: false },
			decommissionedAt: { type: "date", required: false },
			decommissionedBy: { type: "string", required: false },
		},
	},
	scimManagedCredential: {
		fields: {
			connectionRecordId: {
				type: "string",
				required: true,
				index: true,
				references: {
					model: "scimManagedConnection",
					field: "id",
					onDelete: "cascade",
				},
			},
			credentialId: {
				type: "string",
				required: true,
				unique: true,
			},
			tokenDigest: {
				type: "string",
				required: true,
				returned: false,
			},
			hashVersion: {
				type: "string",
				required: true,
				returned: false,
			},
			activeSlotKey: {
				type: "string",
				required: true,
				unique: true,
				returned: false,
			},
			status: { type: "string", required: true },
			serializedScopes: {
				type: "string",
				required: true,
				returned: false,
			},
			expiresAt: { type: "date", required: true },
			createdAt: { type: "date", required: true },
			createdBy: { type: "string", required: true },
			lastUsedAt: { type: "date", required: false },
			revokedAt: { type: "date", required: false },
			revokedBy: { type: "string", required: false },
			decommissionedAt: { type: "date", required: false },
		},
	},
	scimManagedConnectionEvent: {
		fields: {
			connectionRecordId: {
				type: "string",
				required: true,
				index: true,
				references: {
					model: "scimManagedConnection",
					field: "id",
					onDelete: "cascade",
				},
			},
			eventKey: {
				type: "string",
				required: true,
				unique: true,
				returned: false,
			},
			sequence: { type: "number", required: true },
			type: { type: "string", required: true },
			actorId: { type: "string", required: true },
			credentialId: { type: "string", required: false },
			createdAt: { type: "date", required: true },
		},
	},
} as const;
