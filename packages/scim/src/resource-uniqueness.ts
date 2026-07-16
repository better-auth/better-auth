import { isAPIError } from "better-auth/api";

function isSCIMUniquenessError(error: unknown): boolean {
	if (!isAPIError(error)) return false;
	const body = error.body;
	return (
		typeof body === "object" &&
		body !== null &&
		"status" in body &&
		body.status === "409" &&
		"scimType" in body &&
		body.scimType === "uniqueness"
	);
}

/**
 * Converts a failed resource create to SCIM uniqueness only when a post-rollback
 * read observes the competing committed resource.
 */
export async function runSCIMCreateWithUniquenessCheck<Result>(
	createResource: () => Promise<Result>,
	assertResourceAvailable: () => Promise<void>,
): Promise<Result> {
	try {
		return await createResource();
	} catch (createError) {
		if (isAPIError(createError)) throw createError;
		try {
			await assertResourceAvailable();
		} catch (availabilityError) {
			if (isSCIMUniquenessError(availabilityError)) throw availabilityError;
		}
		throw createError;
	}
}
