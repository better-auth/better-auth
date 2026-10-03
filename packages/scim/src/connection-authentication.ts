import { getCurrentAdapter } from "@better-auth/core/context";
import type { DBAdapter } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { constantTimeEqual } from "better-auth/crypto";
import type {
	SCIMBearerTokenVerification,
	SCIMConnection,
	SCIMDeclaredConnectionVerificationResult,
	SCIMOptions,
	SCIMPrincipal,
	SCIMScope,
} from "./configuration";
import { findOrCreateSCIMConnectionBinding } from "./connection-state";
import {
	isManagedSCIMBearerToken,
	resolveManagedConnectionOptions,
	SCIM_MANAGED_CONNECTION_ID_PREFIX,
	verifyManagedSCIMBearerToken,
} from "./managed-connections";
import type { SCIMConnectionBinding } from "./persistence";
import { createSCIMError } from "./scim-error";

export type SCIMConnectionMiddleware = ReturnType<
	typeof createSCIMConnectionMiddleware
>;

const SCIM_SCOPES = [
	"scim.users.read",
	"scim.users.write",
	"scim.groups.read",
	"scim.groups.write",
] as const satisfies readonly SCIMScope[];

function getRequiredSCIMScope(path: string, method: string): SCIMScope {
	const operation = method === "GET" || method === "HEAD" ? "read" : "write";
	return path.includes("/Groups")
		? `scim.groups.${operation}`
		: `scim.users.${operation}`;
}

export function isValidSCIMConnectionIdentifier(
	value: unknown,
): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 255 &&
		value === value.trim()
	);
}

export function isValidSCIMCredentialId(value: unknown): value is string {
	return isValidSCIMConnectionIdentifier(value);
}

export function areValidSCIMScopes(
	scopes: unknown,
): scopes is readonly SCIMScope[] {
	return (
		Array.isArray(scopes) &&
		scopes.length > 0 &&
		new Set(scopes).size === scopes.length &&
		scopes.every((scope) =>
			SCIM_SCOPES.some((candidate) => candidate === scope),
		)
	);
}

function isSCIMDeclaredConnectionVerificationResult(
	value: unknown,
): value is SCIMDeclaredConnectionVerificationResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"connectionId" in value &&
		!("connection" in value) &&
		isValidSCIMConnectionIdentifier(value.connectionId) &&
		"credentialId" in value &&
		isValidSCIMCredentialId(value.credentialId) &&
		"scopes" in value &&
		areValidSCIMScopes(value.scopes) &&
		(!("expiresAt" in value) ||
			value.expiresAt === undefined ||
			(value.expiresAt instanceof Date &&
				!Number.isNaN(value.expiresAt.getTime())))
	);
}

function resolveVerifiedPrincipal(
	verified: unknown,
	configuredConnections: ReadonlyMap<string, SCIMConnection>,
): SCIMPrincipal | undefined {
	if (typeof verified !== "object" || verified === null) return;
	const hasConnectionId = "connectionId" in verified;
	const hasConnection = "connection" in verified;
	const expiresAt = "expiresAt" in verified ? verified.expiresAt : undefined;
	if (hasConnectionId === hasConnection) return;
	if (
		!("credentialId" in verified) ||
		!isValidSCIMCredentialId(verified.credentialId) ||
		!("scopes" in verified) ||
		!areValidSCIMScopes(verified.scopes) ||
		(expiresAt !== undefined &&
			(!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())))
	) {
		return;
	}
	if (expiresAt instanceof Date && expiresAt.getTime() <= Date.now()) {
		return;
	}

	let connection: SCIMConnection | undefined;
	if (isSCIMDeclaredConnectionVerificationResult(verified)) {
		connection = configuredConnections.get(verified.connectionId);
	} else if (
		hasConnection &&
		typeof verified.connection === "object" &&
		verified.connection !== null &&
		"id" in verified.connection &&
		isValidSCIMConnectionIdentifier(verified.connection.id) &&
		!verified.connection.id.startsWith(SCIM_MANAGED_CONNECTION_ID_PREFIX) &&
		"provisioningDomainId" in verified.connection &&
		isValidSCIMConnectionIdentifier(verified.connection.provisioningDomainId) &&
		!configuredConnections.has(verified.connection.id)
	) {
		connection = {
			id: verified.connection.id,
			provisioningDomainId: verified.connection.provisioningDomainId,
		};
	}
	if (!connection) return;

	const result = verified as SCIMBearerTokenVerification;
	return {
		type: "oauth-bearer",
		connectionId: connection.id,
		provisioningDomainId: connection.provisioningDomainId,
		credentialId: result.credentialId,
		scopes: result.scopes,
		...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
	};
}

function assertConnectionBinding(
	binding: SCIMConnectionBinding,
	connection: SCIMConnection,
): void {
	if (
		binding.connectionId !== connection.id ||
		binding.provisioningDomainId !== connection.provisioningDomainId
	) {
		throw createSCIMError("CONFLICT", {
			detail:
				"The connection provisioningDomainId changed after the connection was first used",
		});
	}
}

async function bindSCIMConnection(
	adapter: Pick<DBAdapter, "create" | "findOne">,
	connection: SCIMConnection,
): Promise<SCIMConnectionBinding> {
	return findOrCreateSCIMConnectionBinding(
		adapter,
		connection.id,
		connection.provisioningDomainId,
		new Date(),
		{ decommissionStatus: "active" },
		(binding) => assertConnectionBinding(binding, connection),
	);
}

/** Resolves one immutable SCIM connection from a bearer credential. */
export function createSCIMConnectionMiddleware(options: SCIMOptions) {
	const configuredConnections = new Map(
		options.connections.map((connection) => [
			connection.id,
			{
				id: connection.id,
				provisioningDomainId: connection.provisioningDomainId ?? connection.id,
			} satisfies SCIMConnection,
		]),
	);
	const managedConnectionOptions = options.managedConnections
		? resolveManagedConnectionOptions(options.managedConnections)
		: undefined;
	return createAuthMiddleware(async (ctx) => {
		const authorization = ctx.headers?.get("authorization");
		const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
		const rejectAuthentication = (detail: string): never => {
			ctx.setHeader("www-authenticate", 'Bearer realm="SCIM"');
			throw createSCIMError("UNAUTHORIZED", { detail });
		};

		if (!bearerToken) {
			return rejectAuthentication("SCIM bearer token is required");
		}

		let principal: SCIMPrincipal | undefined;
		for (const configuredConnection of options.connections) {
			for (const credential of configuredConnection.credentials) {
				const matches = constantTimeEqual(credential.token, bearerToken);
				const active =
					credential.expiresAt === undefined ||
					credential.expiresAt.getTime() > Date.now();
				if (!principal && matches && active) {
					principal = {
						type: "static-bearer",
						connectionId: configuredConnection.id,
						provisioningDomainId:
							configuredConnection.provisioningDomainId ??
							configuredConnection.id,
						credentialId: credential.id,
						scopes: credential.scopes ?? SCIM_SCOPES,
						...(credential.expiresAt
							? { expiresAt: credential.expiresAt }
							: {}),
					};
				}
			}
		}

		const managedToken = isManagedSCIMBearerToken(bearerToken);
		if (!principal && managedToken && managedConnectionOptions) {
			const managedDatabase = await getCurrentAdapter(ctx.context.adapter);
			principal = await verifyManagedSCIMBearerToken(
				managedDatabase,
				bearerToken,
				managedConnectionOptions,
			);
		}

		if (!principal && !managedToken && options.authentication) {
			const verified: unknown = await options.authentication.verifyBearerToken(
				{
					token: bearerToken,
					method: ctx.method,
					path: ctx.path,
					headers: new Headers(ctx.headers),
				},
				{
					database: {
						findOne: ctx.context.adapter.findOne,
						update: ctx.context.adapter.update,
					},
				},
			);
			principal = resolveVerifiedPrincipal(verified, configuredConnections);
		}

		if (!principal) {
			return rejectAuthentication("Invalid SCIM bearer token");
		}
		const requiredScope = getRequiredSCIMScope(ctx.path, ctx.method);
		if (!principal.scopes.includes(requiredScope)) {
			throw createSCIMError("FORBIDDEN", {
				detail: `The SCIM bearer token is missing the ${requiredScope} scope`,
			});
		}
		const connection: SCIMConnection = {
			id: principal.connectionId,
			provisioningDomainId: principal.provisioningDomainId,
		};
		const binding = await bindSCIMConnection(ctx.context.adapter, connection);
		if (binding.decommissionStatus !== "active") {
			return rejectAuthentication("SCIM connection is decommissioned");
		}

		return { scimConnection: connection, scimPrincipal: principal };
	});
}
