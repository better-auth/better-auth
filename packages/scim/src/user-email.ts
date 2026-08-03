import type { SCIMEmail } from "./configuration";

/** Create a case-insensitive identity for one complex email value. */
export function createSCIMEmailTupleKey(
	email: Pick<SCIMEmail, "type" | "value">,
): string {
	return JSON.stringify([
		email.type?.trim().toLowerCase() ?? null,
		email.value.trim().toLowerCase(),
	]);
}

/** Serialize the 1.7 compatibility mirror for canonical email values. */
export function serializeSCIMEmails(emails: readonly SCIMEmail[]): string {
	return JSON.stringify(emails);
}
