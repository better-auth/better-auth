import type {
	SCIMManagedConnection,
	SCIMManagedConnectionEvent,
	SCIMManagedCredential,
} from "@better-auth/scim";
import { SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT } from "@better-auth/scim";
import type { BetterAuthOptions, DBAdapter } from "better-auth";
import { auth } from "@/lib/auth";
import {
	getSCIMDemoBaseURL,
	getSCIMDemoProvisioningDomainId,
} from "@/lib/scim-demo";
import {
	createSCIMDemoDirectoryFixtures,
	getSCIMDemoOIDCIssuer,
	isSCIMDemoOIDCConfigured,
	SCIM_DEMO_SSO_PROVIDER_ID,
} from "@/lib/scim-demo-identity";

export const SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS = {
	"cache-control": "private, no-store",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
} as const;

interface SCIMDemoMemberRow {
	id: string;
	role: string;
}

interface SCIMDemoUserObservation {
	id: string;
	externalId?: string | null;
	userName: string;
	displayName: string;
	active: boolean;
}

interface SCIMDemoGroupObservation {
	id: string;
	externalId?: string | null;
	displayName: string;
}

export interface SCIMDemoManagedState {
	connection: SCIMManagedConnection;
	credentials: readonly SCIMManagedCredential[];
	events: readonly SCIMManagedConnectionEvent[];
}

export function createSCIMDemoManagementError(
	status: number,
	message: string,
): Error {
	return Object.assign(new Error(message), { status });
}

/**
 * Derives a stable creation-request id from the provisioning domain so
 * concurrent connection creates for the same organization collide on the
 * plugin's existing creationRequestId uniqueness instead of both succeeding.
 */
export function createSCIMDemoConnectionCreationRequestId(
	provisioningDomainId: string,
): string {
	return `scim-demo-connection-request:${provisioningDomainId}`;
}

export function isSCIMManagedCreationRequestConflict(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"body" in error &&
		typeof error.body === "object" &&
		error.body !== null &&
		"code" in error.body &&
		error.body.code === SCIM_MANAGED_CREATION_REQUEST_ID_CONFLICT
	);
}

function getSCIMDemoManagementError(error: unknown): {
	status: number;
	message: string;
} {
	if (error instanceof Error) {
		if ("statusCode" in error && typeof error.statusCode === "number") {
			return { status: error.statusCode, message: error.message };
		}
		if ("status" in error && typeof error.status === "number") {
			return { status: error.status, message: error.message };
		}
	}
	return {
		status: 500,
		message: "The SCIM demo request could not be completed",
	};
}

export function scimDemoManagementErrorResponse(error: unknown): Response {
	const failure = getSCIMDemoManagementError(error);
	return Response.json(
		{ error: failure.message },
		{
			status: failure.status,
			headers: SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
		},
	);
}

export function isSCIMDemoManagementRole(role: string): boolean {
	return role
		.split(",")
		.map((candidate) => candidate.trim())
		.some((candidate) => candidate === "owner" || candidate === "admin");
}

async function assertSCIMDemoOrganizationManager<
	Options extends BetterAuthOptions,
>(
	database: Pick<DBAdapter<Options>, "findOne">,
	userId: string,
	organizationId: string,
): Promise<void> {
	const member = await database.findOne<SCIMDemoMemberRow>({
		model: "member",
		where: [
			{ field: "userId", value: userId },
			{ field: "organizationId", value: organizationId },
		],
	});
	if (!member || !isSCIMDemoManagementRole(member.role)) {
		throw createSCIMDemoManagementError(
			403,
			"Organization owner or administrator access is required",
		);
	}
}

export async function authorizeSCIMDemoManagementRequest(
	request: Request,
	organizationId: string,
	options: { mutation: boolean },
) {
	if (
		options.mutation &&
		request.headers.get("origin") !== getSCIMDemoBaseURL()
	) {
		throw createSCIMDemoManagementError(
			403,
			"Cross-origin SCIM demo requests are not allowed",
		);
	}
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		throw createSCIMDemoManagementError(401, "Authentication required");
	}
	const context = await auth.$context;
	await assertSCIMDemoOrganizationManager(
		context.adapter,
		session.user.id,
		organizationId,
	);
	return { context, session };
}

export function assertSCIMDemoOrganizationContext(
	bodyOrganizationId: string,
	pathOrganizationId: string,
): void {
	if (bodyOrganizationId !== pathOrganizationId) {
		throw createSCIMDemoManagementError(
			400,
			"The organization context did not match the request path",
		);
	}
}

export function assertSCIMDemoCredentialContext(
	body: { organizationId: string; credentialId: string },
	path: { organizationId: string; credentialId: string },
): void {
	if (
		body.organizationId !== path.organizationId ||
		body.credentialId !== path.credentialId
	) {
		throw createSCIMDemoManagementError(
			400,
			"The credential context did not match the request path",
		);
	}
}

export async function loadSCIMDemoManagedState(
	organizationId: string,
): Promise<SCIMDemoManagedState | null> {
	const provisioningDomainId = getSCIMDemoProvisioningDomainId(organizationId);
	const { connections } = await auth.api.listSCIMManagedConnections({
		body: { provisioningDomainId },
	});
	if (connections.length > 1) {
		throw createSCIMDemoManagementError(
			409,
			"The SCIM demo requires exactly one connection per organization",
		);
	}
	const connection = connections[0];
	if (!connection) return null;
	const [state, history] = await Promise.all([
		auth.api.getSCIMManagedConnection({
			body: {
				connectionId: connection.connectionId,
				provisioningDomainId,
			},
		}),
		auth.api.listSCIMManagedConnectionEvents({
			body: {
				connectionId: connection.connectionId,
				provisioningDomainId,
			},
		}),
	]);
	return { ...state, events: history.events };
}

export async function createSCIMDemoConnectionResponse<
	Options extends BetterAuthOptions,
>(database: Pick<DBAdapter<Options>, "findMany">, state: SCIMDemoManagedState) {
	const [users, groups, fixtures] = await Promise.all([
		database.findMany<SCIMDemoUserObservation>({
			model: "scimUser",
			where: [
				{
					field: "connectionId",
					value: state.connection.connectionId,
				},
			],
			sortBy: { field: "userName", direction: "asc" },
			select: ["id", "externalId", "userName", "displayName", "active"],
		}),
		database.findMany<SCIMDemoGroupObservation>({
			model: "scimGroup",
			where: [
				{
					field: "connectionId",
					value: state.connection.connectionId,
				},
			],
			sortBy: { field: "displayName", direction: "asc" },
			select: ["id", "externalId", "displayName"],
		}),
		createSCIMDemoDirectoryFixtures(state.connection.connectionId),
	]);
	return {
		connection: state.connection,
		credentials: state.credentials.map((credential) => ({
			id: credential.credentialId,
			status: credential.status,
			scopes: credential.scopes,
			createdAt: credential.createdAt,
			createdBy: credential.createdBy,
			expiresAt: credential.expiresAt,
			lastAuthenticatedAt: credential.lastUsedAt,
			revokedAt: credential.revokedAt,
		})),
		events: state.events.map((event) => ({
			sequence: event.sequence,
			type: event.type,
			actorUserId: event.actorId,
			credentialId: event.credentialId,
			createdAt: event.createdAt,
		})),
		directory: { fixtures },
		resources: { users, groups },
		oidc: isSCIMDemoOIDCConfigured()
			? {
					providerId: SCIM_DEMO_SSO_PROVIDER_ID,
					issuer: getSCIMDemoOIDCIssuer(),
				}
			: null,
	};
}

export function createSCIMDemoCredentialExpiry(expiresInDays = 90): Date {
	return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1_000);
}
