import type { DBAdapter } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { constantTimeEqual } from "better-auth/crypto";
import type {
	SCIMBearerTokenVerificationResult,
	SCIMConnection,
	SCIMOptions,
	SCIMPrincipal,
	SCIMScope,
} from "./configuration";
import { createSCIMConnectionKey } from "./connection-state";
import type { SCIMConnectionBinding } from "./persistence";
import { createSCIMError } from "./scim-error";
import { assertNativeSCIMTransactions } from "./transaction";

export type SCIMConnectionMiddleware = ReturnType<
	typeof createSCIMConnectionMiddleware
>;

export const SCIM_SCOPES = [
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

export function isValidSCIMCredentialId(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 255 &&
		value === value.trim()
	);
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

function isSCIMBearerTokenVerificationResult(
	value: unknown,
): value is SCIMBearerTokenVerificationResult {
	return (
		typeof value === "object" &&
		value !== null &&
		"connectionId" in value &&
		typeof value.connectionId === "string" &&
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
	const connectionKey = createSCIMConnectionKey(connection.id);
	const findBinding = () =>
		adapter.findOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [{ field: "connectionKey", value: connectionKey }],
		});
	const existing = await findBinding();
	if (existing) {
		assertConnectionBinding(existing, connection);
		return existing;
	}

	try {
		return await adapter.create<
			Omit<SCIMConnectionBinding, "id">,
			SCIMConnectionBinding
		>({
			model: "scimConnectionBinding",
			data: {
				connectionId: connection.id,
				connectionKey,
				provisioningDomainId: connection.provisioningDomainId,
				createdAt: new Date(),
				decommissionStatus: "active",
				decommissionReconciledUserCount: 0,
				decommissionBatchCount: 0,
				decommissionRevision: 0,
			},
		});
	} catch (error) {
		const concurrentlyCreated = await findBinding();
		if (!concurrentlyCreated) throw error;
		assertConnectionBinding(concurrentlyCreated, connection);
		return concurrentlyCreated;
	}
}

/** Resolves one immutable SCIM connection from a bearer credential. */
export function createSCIMConnectionMiddleware(options: SCIMOptions) {
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
				if (matches && active) {
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

		if (!principal && options.authentication) {
			const verified: unknown = await options.authentication.verifyBearerToken({
				token: bearerToken,
				method: ctx.method,
				path: ctx.path,
				headers: new Headers(ctx.headers),
			});
			if (isSCIMBearerTokenVerificationResult(verified)) {
				const configuredConnection = options.connections.find(
					(connection) => connection.id === verified.connectionId,
				);
				const active =
					verified.expiresAt === undefined ||
					(verified.expiresAt instanceof Date &&
						!Number.isNaN(verified.expiresAt.getTime()) &&
						verified.expiresAt.getTime() > Date.now());
				if (configuredConnection && active) {
					principal = {
						type: "oauth-bearer",
						connectionId: configuredConnection.id,
						provisioningDomainId:
							configuredConnection.provisioningDomainId ??
							configuredConnection.id,
						credentialId: verified.credentialId,
						scopes: verified.scopes,
						...(verified.expiresAt ? { expiresAt: verified.expiresAt } : {}),
					};
				}
			}
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
		assertNativeSCIMTransactions(ctx.context.adapter);
		const binding = await bindSCIMConnection(ctx.context.adapter, connection);
		if (binding.decommissionStatus !== "active") {
			return rejectAuthentication("SCIM connection is decommissioned");
		}

		return { scimConnection: connection, scimPrincipal: principal };
	});
}
