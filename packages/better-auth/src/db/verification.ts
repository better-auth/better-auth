import type {
	GenericEndpointContext,
	InternalAdapter,
} from "@better-auth/core";
import {
	encodeDeterministicId,
	isUniqueViolation,
} from "@better-auth/core/db/internal";
import { createHash } from "@better-auth/utils/hash";
import {
	getStorageOption,
	processIdentifier,
} from "./verification-token-storage";

/**
 * Creates a verification value, or returns the one a concurrent request stored
 * first. With the default or `"uuid"` id strategy, the id is derived from the
 * stored `identifier`, so the primary key keeps one row per identifier even
 * though the schema does not make `identifier` unique.
 */
export async function createOrFindVerification(
	ctx: GenericEndpointContext,
	data: Parameters<InternalAdapter["createVerificationValue"]>[0],
) {
	const { internalAdapter } = ctx.context;
	const id = await deriveVerificationId(ctx, data.identifier);
	return internalAdapter
		.createVerificationValue(id ? { ...data, id } : data)
		.catch(async (error: unknown) => {
			if (!isUniqueViolation(error)) throw error;
			const existing = await internalAdapter.findVerificationValue(
				data.identifier,
			);
			if (!existing) throw error;
			return existing;
		});
}

async function deriveVerificationId(
	ctx: GenericEndpointContext,
	identifier: string,
) {
	const { options } = ctx.context;
	const generateId = options.advanced?.database?.generateId;
	// Custom and database-generated ids live in columns whose type is unknown here.
	if (generateId !== undefined && generateId !== "uuid") return undefined;
	const storedIdentifier = await processIdentifier(
		identifier,
		getStorageOption(identifier, options.verification?.storeIdentifier),
	);
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(`verification:${storedIdentifier}`),
	);
	// 24 bytes encode to 32 characters, within the `varchar(36)` id column.
	return encodeDeterministicId(new Uint8Array(digest).slice(0, 24), options, {
		adapter: ctx.context.adapter,
		model: "verification",
	});
}

/**
 * Writes a consumed verification value back, such as a code with one more
 * failed attempt, unless a value issued after the consume already holds the
 * identifier. Returns the stored value, which is the newer one when this
 * write yields, or `null` when a `verification.create.before` hook vetoes it.
 *
 * In the database, the derived id of `createOrFindVerification` also makes the
 * write yield. Secondary storage has no conditional write, so a value issued
 * between this read and the write can still be replaced.
 */
export async function restoreVerification(
	ctx: GenericEndpointContext,
	data: Parameters<InternalAdapter["createVerificationValue"]>[0] & {
		createdAt: Date;
	},
) {
	const issued = await ctx.context.internalAdapter.findVerificationValue(
		data.identifier,
	);
	if (issued) return issued;
	return createOrFindVerification(ctx, data);
}
