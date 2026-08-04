import { acquireActiveSCIMUserLink } from "@better-auth/scim";
import type {
	SSOUserResolution,
	SSOUserResolutionContext,
	SSOUserResolutionInput,
} from "@better-auth/sso";
import type {
	BetterAuthOptions,
	DBAdapter,
	DBTransactionAdapter,
} from "better-auth";
import { getSCIMDemoProvisioningDomainId } from "./scim-demo.ts";
import type { SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import { SCIM_DEMO_DIRECTORY_USERS } from "./scim-demo-catalog.ts";
import {
	getSCIMDemoOIDCIssuer,
	isSCIMDemoV2Subject,
	resolveSCIMDemoV2Subject,
	SCIM_DEMO_SSO_PROVIDER_ID,
} from "./scim-demo-identity.ts";

const SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE =
	"better-auth:scim-demo:employee-access:v2";
const SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE =
	"better-auth:scim-demo:employee-portal:v2";
const SCIM_DEMO_EMPLOYEE_ACCESS_TTL_MS = 5 * 60 * 1_000;
const SCIM_DEMO_EMPLOYEE_PORTAL_TTL_MS = 10 * 60 * 1_000;
const SCIM_DEMO_EMPLOYEE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const SCIM_DEMO_EMPLOYEE_PORTAL_COOKIE =
	"better-auth.scim_demo_employee_portal";
export const SCIM_DEMO_CONNECTION_ID_CLAIM = "scim_demo_connection_id";

interface SCIMDemoEmployeeSourceRow {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	userId: string;
	externalId?: string | null;
	userName: string;
	displayName: string;
	active: boolean;
}

interface SCIMDemoEmployeeUserRow {
	id: string;
	email: string;
	name: string;
	scimDemoRole?: string | null;
}

interface SCIMDemoEmployeeSubjectRow {
	id: string;
	userId: string;
}

interface SCIMDemoManagedConnectionRow {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	status: "active" | "decommissioning" | "decommissioned";
}

export interface SCIMDemoEmployeeIdentity {
	connectionId: string;
	displayName: string;
	email: string;
	scimUserId: string;
	subject: string;
	userId: string;
	userKey: SCIMDemoUserKey;
}

export interface SCIMDemoEmployeePortalIdentity
	extends SCIMDemoEmployeeIdentity {
	role: string | null;
}

export interface SCIMDemoEmployeeVerificationRecord
	extends SCIMDemoEmployeeIdentity {
	audience:
		| typeof SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE
		| typeof SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE;
	expiresAt: string;
	version: 2;
}

export interface SCIMDemoEmployeeVerificationStore {
	consumeVerificationValue(
		identifier: string,
	): Promise<{ value: string } | null>;
	createVerificationValue(input: {
		expiresAt: Date;
		identifier: string;
		value: string;
	}): Promise<unknown>;
	findVerificationValue(
		identifier: string,
	): Promise<{ value: string; expiresAt: Date } | null>;
}

function encodeBase64URL(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

function generateOpaqueValue(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return encodeBase64URL(bytes);
}

async function getEmployeeTokenKey(): Promise<CryptoKey> {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error(
			"BETTER_AUTH_SECRET must contain at least 32 characters for SCIM employee access",
		);
	}
	return await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
}

async function createVerificationIdentifier(
	audience:
		| typeof SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE
		| typeof SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE,
	token: string,
): Promise<string> {
	const digest = await crypto.subtle.sign(
		"HMAC",
		await getEmployeeTokenKey(),
		new TextEncoder().encode(`${audience}:${token}`),
	);
	return `${audience}:${encodeBase64URL(new Uint8Array(digest))}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVerificationRecord(
	value: string,
	audience: SCIMDemoEmployeeVerificationRecord["audience"],
): SCIMDemoEmployeeVerificationRecord | null {
	const record = decodeVerificationRecord(value, audience);
	if (!record || new Date(record.expiresAt).getTime() <= Date.now())
		return null;
	return record;
}

function decodeVerificationRecord(
	value: string,
	audience: SCIMDemoEmployeeVerificationRecord["audience"],
): SCIMDemoEmployeeVerificationRecord | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	if (
		!isRecord(parsed) ||
		parsed.version !== 2 ||
		parsed.audience !== audience ||
		typeof parsed.connectionId !== "string" ||
		typeof parsed.displayName !== "string" ||
		typeof parsed.email !== "string" ||
		typeof parsed.expiresAt !== "string" ||
		typeof parsed.scimUserId !== "string" ||
		typeof parsed.subject !== "string" ||
		typeof parsed.userId !== "string" ||
		typeof parsed.userKey !== "string" ||
		!SCIM_DEMO_DIRECTORY_USERS.some((user) => user.key === parsed.userKey)
	) {
		return null;
	}
	const expiresAt = new Date(parsed.expiresAt);
	if (!Number.isFinite(expiresAt.getTime())) return null;
	return parsed as unknown as SCIMDemoEmployeeVerificationRecord;
}

export function inspectSCIMDemoEmployeeVerification(input: {
	identifier: string;
	value: string;
}):
	| { status: "not-employee" }
	| { status: "invalid" }
	| {
			status: "valid";
			record: SCIMDemoEmployeeVerificationRecord;
	  } {
	const audience = input.identifier.startsWith(
		`${SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE}:`,
	)
		? SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE
		: input.identifier.startsWith(`${SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE}:`)
			? SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE
			: null;
	if (!audience) return { status: "not-employee" };
	const identifierDigest = input.identifier.slice(audience.length + 1);
	if (!SCIM_DEMO_EMPLOYEE_TOKEN_PATTERN.test(identifierDigest)) {
		return { status: "invalid" };
	}
	const record = decodeVerificationRecord(input.value, audience);
	return record ? { status: "valid", record } : { status: "invalid" };
}

async function findEligibleConnection(
	database: Pick<DBAdapter, "findOne"> | Pick<DBTransactionAdapter, "findOne">,
	connectionId: string,
): Promise<SCIMDemoManagedConnectionRow | null> {
	const connection = await database.findOne<SCIMDemoManagedConnectionRow>({
		model: "scimManagedConnection",
		where: [{ field: "connectionId", value: connectionId }],
	});
	return connection?.status === "active" ? connection : null;
}

interface SCIMDemoResolvedEmployeeSource {
	connection: SCIMDemoManagedConnectionRow;
	source: SCIMDemoEmployeeSourceRow & { externalId: string };
}

async function resolveConnectionAndSource(
	database: Pick<DBAdapter, "findOne"> | Pick<DBTransactionAdapter, "findOne">,
	connectionId: string,
	scimUserId: string,
): Promise<SCIMDemoResolvedEmployeeSource | null> {
	const connection = await findEligibleConnection(database, connectionId);
	if (!connection) return null;
	const source = await database.findOne<SCIMDemoEmployeeSourceRow>({
		model: "scimUser",
		where: [
			{ field: "id", value: scimUserId },
			{ field: "connectionId", value: connection.connectionId },
			{ field: "active", value: true },
		],
	});
	if (
		!source?.externalId ||
		source.provisioningDomainId !== connection.provisioningDomainId
	) {
		return null;
	}
	return {
		connection,
		source: source as SCIMDemoResolvedEmployeeSource["source"],
	};
}

/**
 * Resolves the exact scim user by id first, then its own connection. A
 * scimUserId uniquely determines its connection, so an organization with
 * multiple active connections cannot have this pick the wrong one.
 */
async function resolveConnectionAndSourceByOrganization(
	database: Pick<DBAdapter, "findOne"> | Pick<DBTransactionAdapter, "findOne">,
	organizationId: string,
	scimUserId: string,
): Promise<SCIMDemoResolvedEmployeeSource | null> {
	const source = await database.findOne<SCIMDemoEmployeeSourceRow>({
		model: "scimUser",
		where: [
			{ field: "id", value: scimUserId },
			{ field: "active", value: true },
		],
	});
	if (!source?.externalId) return null;
	const connection = await findEligibleConnection(
		database,
		source.connectionId,
	);
	if (
		!connection ||
		connection.provisioningDomainId !==
			getSCIMDemoProvisioningDomainId(organizationId) ||
		source.provisioningDomainId !== connection.provisioningDomainId
	) {
		return null;
	}
	return {
		connection,
		source: source as SCIMDemoResolvedEmployeeSource["source"],
	};
}

async function acquireEmployeeIdentity(
	database: Pick<DBTransactionAdapter, "findOne" | "incrementOne">,
	input:
		| { organizationId: string; scimUserId: string }
		| { record: SCIMDemoEmployeeVerificationRecord },
): Promise<SCIMDemoEmployeeIdentity | null> {
	const resolved =
		"record" in input
			? await resolveConnectionAndSource(
					database,
					input.record.connectionId,
					input.record.scimUserId,
				)
			: await resolveConnectionAndSourceByOrganization(
					database,
					input.organizationId,
					input.scimUserId,
				);
	if (!resolved) return null;
	const { connection, source } = resolved;
	const userKey = await resolveSCIMDemoV2Subject(
		connection.connectionId,
		source.externalId,
	);
	if (!userKey) return null;
	if (
		"record" in input &&
		(input.record.subject !== source.externalId ||
			input.record.userKey !== userKey ||
			input.record.userId !== source.userId)
	) {
		return null;
	}
	const link = await acquireActiveSCIMUserLink(
		{
			connectionId: connection.connectionId,
			externalId: source.externalId,
		},
		{ database },
	);
	if (!link || link.scimUserId !== source.id || link.userId !== source.userId) {
		return null;
	}
	return {
		connectionId: connection.connectionId,
		displayName: source.displayName,
		email: source.userName,
		scimUserId: source.id,
		subject: source.externalId,
		userId: source.userId,
		userKey,
	};
}

async function validateEmployeeIdentity(
	database: Pick<DBAdapter, "findOne">,
	record: SCIMDemoEmployeeVerificationRecord,
): Promise<SCIMDemoEmployeeIdentity | null> {
	const connection = await findEligibleConnection(
		database,
		record.connectionId,
	);
	if (!connection) return null;
	const source = await database.findOne<SCIMDemoEmployeeSourceRow>({
		model: "scimUser",
		where: [
			{ field: "id", value: record.scimUserId },
			{ field: "connectionId", value: record.connectionId },
			{ field: "userId", value: record.userId },
			{ field: "externalId", value: record.subject },
			{ field: "active", value: true },
		],
	});
	if (
		!source ||
		source.externalId !== record.subject ||
		source.provisioningDomainId !== connection.provisioningDomainId
	) {
		return null;
	}
	const [subject, user, resolvedUserKey] = await Promise.all([
		database.findOne<SCIMDemoEmployeeSubjectRow>({
			model: "scimSubject",
			where: [{ field: "userId", value: record.userId }],
		}),
		database.findOne<SCIMDemoEmployeeUserRow>({
			model: "user",
			where: [{ field: "id", value: record.userId }],
		}),
		resolveSCIMDemoV2Subject(record.connectionId, record.subject),
	]);
	if (
		!subject ||
		!user ||
		resolvedUserKey !== record.userKey ||
		source.userId !== subject.userId
	) {
		return null;
	}
	return {
		connectionId: record.connectionId,
		displayName: source.displayName,
		email: source.userName,
		scimUserId: source.id,
		subject: source.externalId,
		userId: source.userId,
		userKey: record.userKey,
	};
}

function createRecord(
	identity: SCIMDemoEmployeeIdentity,
	audience: SCIMDemoEmployeeVerificationRecord["audience"],
	expiresAt: Date,
): SCIMDemoEmployeeVerificationRecord {
	return {
		...identity,
		audience,
		expiresAt: expiresAt.toISOString(),
		version: 2,
	};
}

export async function createSCIMDemoEmployeeAccessGrant<
	Options extends BetterAuthOptions,
>(
	database: Pick<DBAdapter<Options>, "findOne" | "transaction">,
	store: Pick<SCIMDemoEmployeeVerificationStore, "createVerificationValue">,
	input: { organizationId: string; scimUserId: string },
): Promise<{ url: string } | null> {
	const identity = await database.transaction(async (transaction) => {
		return await acquireEmployeeIdentity(transaction, input);
	});
	if (!identity) return null;
	const token = generateOpaqueValue();
	const expiresAt = new Date(Date.now() + SCIM_DEMO_EMPLOYEE_ACCESS_TTL_MS);
	await store.createVerificationValue({
		identifier: await createVerificationIdentifier(
			SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE,
			token,
		),
		value: JSON.stringify(
			createRecord(identity, SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE, expiresAt),
		),
		expiresAt,
	});
	const baseURL = process.env.BETTER_AUTH_URL;
	if (!baseURL)
		throw new Error("BETTER_AUTH_URL is required for the SCIM demo");
	const url = new URL("/scim-demo/employee/access", baseURL);
	url.searchParams.set("grant", token);
	return { url: url.toString() };
}

export async function consumeSCIMDemoEmployeeAccessGrant<
	Options extends BetterAuthOptions,
>(
	database: Pick<DBAdapter<Options>, "findOne">,
	store: Pick<
		SCIMDemoEmployeeVerificationStore,
		"consumeVerificationValue" | "createVerificationValue"
	>,
	token: string,
): Promise<{ cookie: string } | null> {
	if (!SCIM_DEMO_EMPLOYEE_TOKEN_PATTERN.test(token)) return null;
	const consumed = await store.consumeVerificationValue(
		await createVerificationIdentifier(
			SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE,
			token,
		),
	);
	if (!consumed) return null;
	const record = parseVerificationRecord(
		consumed.value,
		SCIM_DEMO_EMPLOYEE_ACCESS_AUDIENCE,
	);
	if (!record) return null;
	const identity = await validateEmployeeIdentity(database, record);
	if (!identity) return null;
	const portalToken = generateOpaqueValue();
	const expiresAt = new Date(Date.now() + SCIM_DEMO_EMPLOYEE_PORTAL_TTL_MS);
	await store.createVerificationValue({
		identifier: await createVerificationIdentifier(
			SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE,
			portalToken,
		),
		value: JSON.stringify(
			createRecord(identity, SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE, expiresAt),
		),
		expiresAt,
	});
	return { cookie: serializeSCIMDemoEmployeePortalCookie(portalToken) };
}

/**
 * Resolves the portal identity bound to one exact portal token. Callers that
 * already hold a specific link's token (for example, a value carried through
 * an OAuth login_hint) should use this instead of the ambient cookie so a
 * second browser tab overwriting the shared portal cookie cannot redirect
 * this flow to a different employee.
 */
export async function getSCIMDemoEmployeePortalIdentityByToken<
	Options extends BetterAuthOptions,
>(
	database: Pick<DBAdapter<Options>, "findOne">,
	store: Pick<SCIMDemoEmployeeVerificationStore, "findVerificationValue">,
	token: string,
): Promise<SCIMDemoEmployeePortalIdentity | null> {
	if (!SCIM_DEMO_EMPLOYEE_TOKEN_PATTERN.test(token)) return null;
	const verification = await store.findVerificationValue(
		await createVerificationIdentifier(
			SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE,
			token,
		),
	);
	if (!verification) return null;
	const record = parseVerificationRecord(
		verification.value,
		SCIM_DEMO_EMPLOYEE_PORTAL_AUDIENCE,
	);
	if (!record) return null;
	const identity = await validateEmployeeIdentity(database, record);
	if (!identity) return null;
	const user = await database.findOne<SCIMDemoEmployeeUserRow>({
		model: "user",
		where: [{ field: "id", value: identity.userId }],
	});
	return user
		? {
				...identity,
				role: user.scimDemoRole ?? null,
			}
		: null;
}

export function getSCIMDemoEmployeePortalToken(
	cookieHeader: string | null,
): string | null {
	const token = readCookie(cookieHeader, SCIM_DEMO_EMPLOYEE_PORTAL_COOKIE);
	return token && SCIM_DEMO_EMPLOYEE_TOKEN_PATTERN.test(token) ? token : null;
}

export async function getSCIMDemoEmployeePortalIdentity<
	Options extends BetterAuthOptions,
>(
	database: Pick<DBAdapter<Options>, "findOne">,
	store: Pick<SCIMDemoEmployeeVerificationStore, "findVerificationValue">,
	cookieHeader: string | null,
): Promise<SCIMDemoEmployeePortalIdentity | null> {
	const token = getSCIMDemoEmployeePortalToken(cookieHeader);
	if (!token) return null;
	return getSCIMDemoEmployeePortalIdentityByToken(database, store, token);
}

/**
 * Resolves the portal identity for one OIDC authorization request. A
 * login_hint carries the exact link's portal token through the flow so a
 * second tab overwriting the shared portal cookie cannot redirect this
 * request to a different employee. Falls back to the ambient cookie only
 * when no hint was supplied.
 */
export async function resolveSCIMDemoEmployeePortalIdentityForFlow<
	Options extends BetterAuthOptions,
>(
	database: Pick<DBAdapter<Options>, "findOne">,
	store: Pick<SCIMDemoEmployeeVerificationStore, "findVerificationValue">,
	cookieHeader: string | null,
	loginHint: string | null,
): Promise<SCIMDemoEmployeePortalIdentity | null> {
	if (loginHint) {
		return getSCIMDemoEmployeePortalIdentityByToken(database, store, loginHint);
	}
	return getSCIMDemoEmployeePortalIdentity(database, store, cookieHeader);
}

function rejectSCIMDemoSSOUser(): SSOUserResolution {
	return {
		action: "reject",
		code: "SCIM_DEMO_SSO_REJECTED",
		message: "Unable to sign in with this workforce identity",
	};
}

/**
 * Resolves the local OIDC subject through the exact dynamic SCIM connection.
 */
export async function resolveSCIMDemoSSOUser(
	input: SSOUserResolutionInput,
	context: SSOUserResolutionContext,
): Promise<SSOUserResolution> {
	if (input.providerId !== SCIM_DEMO_SSO_PROVIDER_ID) {
		return { action: "continue" };
	}
	if (input.protocol !== "oidc") {
		return rejectSCIMDemoSSOUser();
	}
	if (input.accountKey.issuer !== getSCIMDemoOIDCIssuer()) {
		return rejectSCIMDemoSSOUser();
	}
	const connectionId =
		input.verifiedIdTokenClaims[SCIM_DEMO_CONNECTION_ID_CLAIM];
	const subject = input.accountKey.accountId;
	if (typeof connectionId !== "string" || !isSCIMDemoV2Subject(subject)) {
		return rejectSCIMDemoSSOUser();
	}
	const connection =
		await context.database.findOne<SCIMDemoManagedConnectionRow>({
			model: "scimManagedConnection",
			where: [{ field: "connectionId", value: connectionId }],
		});
	if (
		!connection ||
		connection.status !== "active" ||
		!(await resolveSCIMDemoV2Subject(connection.connectionId, subject))
	) {
		return rejectSCIMDemoSSOUser();
	}
	const source = await context.database.findOne<SCIMDemoEmployeeSourceRow>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: connection.connectionId },
			{ field: "externalId", value: subject },
			{ field: "active", value: true },
		],
	});
	if (
		!source ||
		source.provisioningDomainId !== connection.provisioningDomainId
	) {
		return rejectSCIMDemoSSOUser();
	}
	const link = await acquireActiveSCIMUserLink(
		{
			connectionId: connection.connectionId,
			externalId: subject,
		},
		context,
	);
	return link
		? {
				action: "link",
				profile: "preserve",
				userId: link.userId,
			}
		: rejectSCIMDemoSSOUser();
}

function readCookie(cookieHeader: string | null, name: string): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const separator = part.indexOf("=");
		if (separator < 0) continue;
		if (part.slice(0, separator).trim() !== name) continue;
		return part.slice(separator + 1).trim();
	}
	return null;
}

function serializeSCIMDemoEmployeePortalCookie(token: string): string {
	const secure =
		process.env.BETTER_AUTH_URL?.startsWith("https://") === true
			? "; Secure"
			: "";
	return `${SCIM_DEMO_EMPLOYEE_PORTAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
		SCIM_DEMO_EMPLOYEE_PORTAL_TTL_MS / 1_000
	}${secure}`;
}
