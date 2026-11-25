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
 * The consume removes every value under the stored identifier, so a live value
 * found there was issued after it. A row under the plain identifier, left from
 * before `storeIdentifier` hashing, is not. Neither storage offers a
 * conditional write for every id strategy, so a value issued between this read
 * and the write can still be replaced.
 */
export async function restoreVerification(
	ctx: GenericEndpointContext,
	data: Parameters<InternalAdapter["createVerificationValue"]>[0] & {
		createdAt: Date;
	},
) {
	const { internalAdapter, options } = ctx.context;
	const [issued, storedIdentifier] = await Promise.all([
		internalAdapter.findVerificationValue(data.identifier),
		processIdentifier(
			data.identifier,
			getStorageOption(data.identifier, options.verification?.storeIdentifier),
		),
	]);
	if (
		issued &&
		issued.identifier === storedIdentifier &&
		new Date(issued.expiresAt).getTime() > Date.now()
	) {
		return issued;
	}
	return createOrFindVerification(ctx, data);
}
