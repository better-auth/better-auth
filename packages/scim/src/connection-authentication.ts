import type { DBAdapter } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { constantTimeEqual } from "better-auth/crypto";
import { createSCIMConnectionKey } from "./connection-state";
import { createSCIMError } from "./scim-error";
import { assertNativeSCIMTransactions } from "./transaction";
import type {
	SCIMConnection,
	SCIMConnectionBinding,
	SCIMOptions,
} from "./types";

export type SCIMConnectionMiddleware = ReturnType<
	typeof createSCIMConnectionMiddleware
>;

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

		let connection: SCIMConnection | undefined;
		for (const configuredConnection of options.connections) {
			for (const credential of configuredConnection.credentials) {
				const matches = constantTimeEqual(credential.token, bearerToken);
				const active =
					credential.expiresAt === undefined ||
					credential.expiresAt.getTime() > Date.now();
				if (matches && active) {
					connection = {
						id: configuredConnection.id,
						provisioningDomainId:
							configuredConnection.provisioningDomainId ??
							configuredConnection.id,
					};
				}
			}
		}

		if (!connection) {
			return rejectAuthentication("Invalid SCIM bearer token");
		}
		assertNativeSCIMTransactions(ctx.context.adapter);
		const binding = await bindSCIMConnection(ctx.context.adapter, connection);
		if (binding.decommissionStatus !== "active") {
			return rejectAuthentication("SCIM connection is decommissioned");
		}

		return { scimConnection: connection };
	});
}
