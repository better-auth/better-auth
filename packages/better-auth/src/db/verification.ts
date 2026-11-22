import type {
	GenericEndpointContext,
	InternalAdapter,
} from "@better-auth/core";
import { isUniqueViolation } from "@better-auth/core/db/internal";

/**
 * Creates a verification value, or returns the one a concurrent request stored
 * first when the database keeps `identifier` unique.
 */
export async function createOrFindVerification(
	ctx: GenericEndpointContext,
	data: Parameters<InternalAdapter["createVerificationValue"]>[0],
) {
	const { internalAdapter } = ctx.context;
	return internalAdapter
		.createVerificationValue(data)
		.catch((error: unknown) => {
			if (!isUniqueViolation(error)) throw error;
			return internalAdapter.findVerificationValue(data.identifier);
		});
}
