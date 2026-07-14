import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { AuthContext, DBAdapter } from "better-auth";
import { BetterAuthError, generateId } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import { createSCIMConnectionKey } from "./connection-state";
import type { SCIMIdentityCoordinator } from "./identity";
import type { SCIMConnectionBinding } from "./persistence";
import type { SCIMProjectionCoordinator } from "./projection";
import {
	findSCIMProjectionDomainBatch,
	reconcileSCIMProjectionDomainBatch,
} from "./projection";
import { assertNativeSCIMTransactions } from "./transaction";

const SCIM_DECOMMISSION_LEASE_DURATION_MS = 5 * 60 * 1000;

const decommissionConnectionBodySchema = z.object({
	connectionId: z.string().trim().min(1).max(255),
});

function createDecommissionResult(binding: SCIMConnectionBinding) {
	if (binding.decommissionStatus === "active") {
		throw new BetterAuthError(
			`SCIM connection "${binding.connectionId}" has not started decommissioning.`,
		);
	}
	return {
		connectionId: binding.connectionId,
		provisioningDomainId: binding.provisioningDomainId,
		status: binding.decommissionStatus,
		decommissionedAt: binding.decommissionedAt ?? null,
		completedAt: binding.decommissionCompletedAt ?? null,
		retryAfter:
			binding.decommissionStatus === "reconciling"
				? (binding.decommissionLeaseExpiresAt ?? null)
				: null,
		reconciledUsers: binding.decommissionReconciledUserCount,
		batches: binding.decommissionBatchCount,
	};
}

async function findConnectionBinding(
	database: Pick<DBAdapter, "findOne">,
	connectionId: string,
): Promise<SCIMConnectionBinding> {
	const binding = await database.findOne<SCIMConnectionBinding>({
		model: "scimConnectionBinding",
		where: [
			{
				field: "connectionKey",
				value: createSCIMConnectionKey(connectionId),
			},
		],
	});
	if (binding) return binding;
	throw new BetterAuthError(
		`SCIM connection "${connectionId}" has no persisted binding.`,
	);
}

async function acquireDecommissionLease(
	database: DBAdapter,
	connectionId: string,
): Promise<{
	binding: SCIMConnectionBinding;
	leaseId?: string;
}> {
	const leaseId = generateId(32);
	for (let attempt = 0; attempt < 10; attempt++) {
		const binding = await findConnectionBinding(database, connectionId);
		if (binding.decommissionStatus === "complete") return { binding };

		const now = new Date();
		const activeLease =
			binding.decommissionStatus === "reconciling" &&
			binding.decommissionLeaseId &&
			binding.decommissionLeaseExpiresAt &&
			binding.decommissionLeaseExpiresAt.getTime() > now.getTime();
		if (activeLease) return { binding };

		const acquired = await database.incrementOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [
				{ field: "id", value: binding.id },
				{
					field: "decommissionRevision",
					value: binding.decommissionRevision,
				},
				{
					field: "decommissionStatus",
					value: binding.decommissionStatus,
				},
			],
			increment: { decommissionRevision: 1 },
			set: {
				decommissionStatus: "reconciling",
				decommissionedAt: binding.decommissionedAt ?? now,
				decommissionCompletedAt: null,
				decommissionLeaseId: leaseId,
				decommissionLeaseExpiresAt: new Date(
					now.getTime() + SCIM_DECOMMISSION_LEASE_DURATION_MS,
				),
			},
		});
		if (acquired) return { binding: acquired, leaseId };
	}

	throw new BetterAuthError(
		`SCIM connection "${connectionId}" changed repeatedly while decommissioning; retry the operation.`,
	);
}

async function releaseDecommissionLease(input: {
	database: DBAdapter;
	bindingId: string;
	leaseId: string;
}): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const binding = await input.database.findOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [{ field: "id", value: input.bindingId }],
		});
		if (
			!binding ||
			binding.decommissionStatus === "complete" ||
			binding.decommissionLeaseId !== input.leaseId
		) {
			return;
		}
		const released = await input.database.incrementOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [
				{ field: "id", value: binding.id },
				{
					field: "decommissionRevision",
					value: binding.decommissionRevision,
				},
				{ field: "decommissionLeaseId", value: input.leaseId },
			],
			increment: { decommissionRevision: 1 },
			set: {
				decommissionLeaseId: null,
				decommissionLeaseExpiresAt: null,
			},
		});
		if (released) return;
	}
}

async function reconcileDecommissionedConnection(input: {
	database: DBAdapter;
	auth: AuthContext;
	projection: SCIMProjectionCoordinator;
	identity: SCIMIdentityCoordinator;
	binding: SCIMConnectionBinding;
	leaseId: string;
}): Promise<SCIMConnectionBinding> {
	try {
		while (true) {
			const checkpoint = await runWithTransaction(input.database, async () => {
				const trx = await getCurrentAdapter(input.database);
				const binding = await trx.findOne<SCIMConnectionBinding>({
					model: "scimConnectionBinding",
					where: [{ field: "id", value: input.binding.id }],
				});
				if (!binding) {
					throw new BetterAuthError(
						`SCIM connection "${input.binding.connectionId}" binding disappeared during decommissioning.`,
					);
				}
				if (binding.decommissionStatus === "complete") return binding;
				if (binding.decommissionLeaseId !== input.leaseId) {
					throw new BetterAuthError(
						`SCIM connection "${binding.connectionId}" decommission lease was taken over by another worker.`,
					);
				}

				const batch = await findSCIMProjectionDomainBatch({
					database: trx,
					provisioningDomainId: binding.provisioningDomainId,
					cursorUserId: binding.decommissionCursorUserId,
				});
				if (!batch) {
					const completed = await trx.incrementOne<SCIMConnectionBinding>({
						model: "scimConnectionBinding",
						where: [
							{ field: "id", value: binding.id },
							{
								field: "decommissionRevision",
								value: binding.decommissionRevision,
							},
							{ field: "decommissionLeaseId", value: input.leaseId },
						],
						increment: { decommissionRevision: 1 },
						set: {
							decommissionStatus: "complete",
							decommissionCompletedAt: new Date(),
							decommissionLeaseId: null,
							decommissionLeaseExpiresAt: null,
						},
					});
					if (completed) return completed;
					throw new BetterAuthError(
						`SCIM connection "${binding.connectionId}" decommission checkpoint changed concurrently.`,
					);
				}

				await reconcileSCIMProjectionDomainBatch({
					database: trx,
					auth: input.auth,
					projection: input.projection,
					identity: input.identity,
					provisioningDomainId: binding.provisioningDomainId,
					batch,
				});
				const now = new Date();
				const set: Partial<SCIMConnectionBinding> = {
					decommissionCursorUserId: batch.cursorUserId,
					...(batch.hasMore
						? {
								decommissionLeaseExpiresAt: new Date(
									now.getTime() + SCIM_DECOMMISSION_LEASE_DURATION_MS,
								),
							}
						: {
								decommissionStatus: "complete" as const,
								decommissionCompletedAt: now,
								decommissionLeaseId: null,
								decommissionLeaseExpiresAt: null,
							}),
				};
				const advanced = await trx.incrementOne<SCIMConnectionBinding>({
					model: "scimConnectionBinding",
					where: [
						{ field: "id", value: binding.id },
						{
							field: "decommissionRevision",
							value: binding.decommissionRevision,
						},
						{ field: "decommissionLeaseId", value: input.leaseId },
					],
					increment: {
						decommissionRevision: 1,
						decommissionReconciledUserCount: batch.userIds.length,
						decommissionBatchCount: 1,
					},
					set,
				});
				if (advanced) return advanced;
				throw new BetterAuthError(
					`SCIM connection "${binding.connectionId}" decommission checkpoint changed concurrently.`,
				);
			});
			if (checkpoint.decommissionStatus === "complete") return checkpoint;
		}
	} catch (error) {
		try {
			await releaseDecommissionLease({
				database: input.database,
				bindingId: input.binding.id,
				leaseId: input.leaseId,
			});
		} catch {
			// Preserve the operation error. An unreleased lease remains recoverable
			// through its persisted expiry.
		}
		throw error;
	}
}

/** Creates the trusted server API for permanently retiring one connection. */
export function createDecommissionSCIMConnectionEndpoint(
	projection: SCIMProjectionCoordinator,
	identity: SCIMIdentityCoordinator,
) {
	return createAuthEndpoint.serverOnly(
		{
			method: "POST",
			body: decommissionConnectionBodySchema,
		},
		async (ctx) => {
			assertNativeSCIMTransactions(ctx.context.adapter);
			const acquired = await acquireDecommissionLease(
				ctx.context.adapter,
				ctx.body.connectionId,
			);
			if (!acquired.leaseId) {
				return ctx.json(createDecommissionResult(acquired.binding));
			}
			const binding = await reconcileDecommissionedConnection({
				database: ctx.context.adapter,
				auth: ctx.context,
				projection,
				identity,
				binding: acquired.binding,
				leaseId: acquired.leaseId,
			});
			return ctx.json(createDecommissionResult(binding));
		},
	);
}
