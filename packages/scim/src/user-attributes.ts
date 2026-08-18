import type { SCIMUser } from "./persistence";
import { createSCIMError } from "./scim-error";
import type { SCIMCanonicalUserAttributes } from "./user-schemas";
import {
	SCIM_MAX_SERIALIZED_USER_ATTRIBUTES_LENGTH,
	SCIM_USER_SCHEMA,
	SCIMCanonicalUserAttributesSchema,
} from "./user-schemas";

function invalidStoredUserAttributes(): never {
	throw createSCIMError("INTERNAL_SERVER_ERROR", {
		detail: "Stored SCIM User attribute state is invalid",
	});
}

/** Serialize one validated, bounded canonical User attribute payload. */
export function serializeSCIMUserAttributes(
	attributes: SCIMCanonicalUserAttributes,
): string {
	const parsed = SCIMCanonicalUserAttributesSchema.safeParse(attributes);
	if (!parsed.success) return invalidStoredUserAttributes();
	const serialized = JSON.stringify(parsed.data);
	if (serialized.length > SCIM_MAX_SERIALIZED_USER_ATTRIBUTES_LENGTH) {
		return invalidStoredUserAttributes();
	}
	return serialized;
}

/**
 * Derive canonical User attributes for a row persisted before
 * `serializedAttributes` existed, from its compatibility mirror columns.
 * These rows predate Enterprise User support, so only the core schema and
 * the mirrored name/email fields can be reconstructed.
 */
function deriveSCIMUserAttributesFromMirrors(
	user: Pick<
		SCIMUser,
		"formattedName" | "givenName" | "familyName" | "serializedEmails"
	>,
): SCIMCanonicalUserAttributes {
	let emails: unknown;
	try {
		emails = JSON.parse(user.serializedEmails);
	} catch {
		return invalidStoredUserAttributes();
	}
	const attributes = SCIMCanonicalUserAttributesSchema.safeParse({
		schemas: [SCIM_USER_SCHEMA],
		name: {
			formatted: user.formattedName,
			...(user.givenName ? { givenName: user.givenName } : {}),
			...(user.familyName ? { familyName: user.familyName } : {}),
		},
		emails,
	});
	if (!attributes.success) return invalidStoredUserAttributes();
	return attributes.data;
}

/** Read and validate one complete canonical User attribute payload. */
export function readSCIMUserAttributes(
	user: Pick<
		SCIMUser,
		| "serializedAttributes"
		| "formattedName"
		| "givenName"
		| "familyName"
		| "serializedEmails"
	>,
): SCIMCanonicalUserAttributes {
	if (!user.serializedAttributes) {
		return deriveSCIMUserAttributesFromMirrors(user);
	}
	if (
		user.serializedAttributes.length >
		SCIM_MAX_SERIALIZED_USER_ATTRIBUTES_LENGTH
	) {
		return invalidStoredUserAttributes();
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(user.serializedAttributes);
	} catch {
		return invalidStoredUserAttributes();
	}
	const attributes = SCIMCanonicalUserAttributesSchema.safeParse(parsed);
	if (!attributes.success) return invalidStoredUserAttributes();
	return attributes.data;
}
