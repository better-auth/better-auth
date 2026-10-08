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
 * Converts a failed resource create or update to SCIM uniqueness only when
 * a post-rollback read observes the competing committed resource.
 */
export async function runSCIMWriteWithUniquenessCheck<Result>(
	writeResource: () => Promise<Result>,
	assertResourceAvailable: () => Promise<void>,
): Promise<Result> {
	try {
		return await writeResource();
	} catch (writeError) {
		if (isAPIError(writeError)) throw writeError;
		try {
			await assertResourceAvailable();
		} catch (availabilityError) {
			if (isSCIMUniquenessError(availabilityError)) throw availabilityError;
		}
		throw writeError;
	}
}
