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
 * first. The id is derived from the stored `identifier`, so the primary key
 * keeps one row per identifier even though the schema does not make
 * `identifier` unique.
 */
export async function createOrFindVerification(
	ctx: GenericEndpointContext,
	data: Parameters<InternalAdapter["createVerificationValue"]>[0],
) {
	const { internalAdapter } = ctx.context;
	const storedIdentifier = await processIdentifier(
		data.identifier,
		getStorageOption(
			data.identifier,
			ctx.context.options.verification?.storeIdentifier,
		),
	);
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(`verification:${storedIdentifier}`),
	);
	// 24 bytes encode to 32 characters, within the `varchar(36)` id column.
	const id = encodeDeterministicId(
		new Uint8Array(digest).slice(0, 24),
		ctx.context.options,
		{
			adapter: ctx.context.adapter,
			model: "verification",
		},
	);
	return internalAdapter
		.createVerificationValue({ ...data, id })
		.catch(async (error: unknown) => {
			if (!isUniqueViolation(error)) throw error;
			const existing = await internalAdapter.findVerificationValue(
				data.identifier,
			);
			// Our own value means the insert succeeded and a hook threw.
			if (!existing || existing.value === data.value) throw error;
			return existing;
		});
}
