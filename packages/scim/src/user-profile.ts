import { createSCIMError } from "./scim-error";
import type { SCIMEmail, SCIMName, SCIMUser } from "./types";
import { createScopedKey } from "./utils";

interface SCIMProfileInput {
	userName: string;
	displayName?: string;
	name?: SCIMName;
	emails?: readonly SCIMEmail[];
}

/** Canonical provider-owned profile fields stored on a SCIM User. */
export interface CanonicalSCIMUserProfile {
	userName: string;
	displayName: string;
	formattedName: string;
	givenName: string | undefined;
	familyName: string | undefined;
	emails: SCIMEmail[];
	primaryEmail: string;
}

/** Create a case-insensitive identity for one complex email value. */
export function createSCIMEmailTupleKey(
	email: Pick<SCIMEmail, "type" | "value">,
): string {
	return JSON.stringify([
		email.type?.trim().toLowerCase() ?? null,
		email.value.trim().toLowerCase(),
	]);
}

function normalizeOptionalString(value?: string): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

/** Normalize the supported multi-valued email set and select one primary. */
export function normalizeSCIMEmails(
	userName: string,
	emails?: readonly SCIMEmail[],
): SCIMEmail[] {
	const normalized = (emails ?? []).map((email) => ({
		value: email.value.trim().toLowerCase(),
		...(email.type?.trim() ? { type: email.type.trim().toLowerCase() } : {}),
		primary: email.primary === true,
	}));
	if (normalized.length === 0) {
		return [{ value: userName.toLowerCase(), primary: true }];
	}

	const explicitPrimaryIndex = normalized.findIndex((email) => email.primary);
	const workEmailIndex = normalized.findIndex((email) => email.type === "work");
	const primaryIndex =
		explicitPrimaryIndex >= 0
			? explicitPrimaryIndex
			: workEmailIndex >= 0
				? workEmailIndex
				: 0;
	return normalized.map((email, index) => ({
		...email,
		primary: index === primaryIndex,
	}));
}

/** Resolve the provider profile independently from the Better Auth User row. */
export function createCanonicalSCIMUserProfile(
	input: SCIMProfileInput,
): CanonicalSCIMUserProfile {
	const userName = input.userName.trim();
	const emails = normalizeSCIMEmails(userName, input.emails);
	const primaryEmail =
		emails.find((email) => email.primary)?.value ??
		emails[0]?.value ??
		userName;
	const givenName = normalizeOptionalString(input.name?.givenName);
	const familyName = normalizeOptionalString(input.name?.familyName);
	const composedName = [givenName, familyName].filter(Boolean).join(" ");
	const formattedName =
		normalizeOptionalString(input.name?.formatted) ??
		normalizeOptionalString(input.displayName) ??
		(composedName || primaryEmail);
	const displayName =
		normalizeOptionalString(input.displayName) ?? formattedName;

	return {
		userName,
		displayName,
		formattedName,
		givenName,
		familyName,
		emails,
		primaryEmail,
	};
}

/** Serialize a bounded canonical email set for adapter-portable storage. */
export function serializeSCIMEmails(emails: readonly SCIMEmail[]): string {
	return JSON.stringify(emails);
}

/** Build an adapter-portable exact-membership index for email equality filters. */
export function createSCIMEmailValueIndex(
	emails: readonly SCIMEmail[],
	type?: string,
): string {
	const normalizedType = type?.trim().toLowerCase();
	const tokens = [
		...new Set(
			emails
				.filter(
					(email) =>
						normalizedType === undefined || email.type === normalizedType,
				)
				.map((email) => createSCIMEmailValueToken(email.value)),
		),
	].sort();
	return `|${tokens.join("|")}|`;
}

/** Create one delimiter-safe token used by an email equality query. */
export function createSCIMEmailValueToken(email: string): string {
	return createScopedKey(["scim-email-value", email.trim().toLowerCase()]);
}

function invalidStoredEmailState(): never {
	throw createSCIMError("INTERNAL_SERVER_ERROR", {
		detail: "Stored SCIM User email state is invalid",
	});
}

/** Read and validate the complete canonical email set from storage. */
export function readSCIMEmails(user: SCIMUser): SCIMEmail[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(user.serializedEmails);
	} catch {
		return invalidStoredEmailState();
	}
	if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) {
		return invalidStoredEmailState();
	}

	const emails: SCIMEmail[] = [];
	for (const candidate of parsed) {
		if (
			typeof candidate !== "object" ||
			candidate === null ||
			!("value" in candidate) ||
			typeof candidate.value !== "string" ||
			candidate.value.trim().toLowerCase() !== candidate.value ||
			("type" in candidate &&
				(typeof candidate.type !== "string" ||
					candidate.type.trim().toLowerCase() !== candidate.type)) ||
			("primary" in candidate && typeof candidate.primary !== "boolean")
		) {
			return invalidStoredEmailState();
		}
		const type = "type" in candidate ? candidate.type : undefined;
		emails.push({
			value: candidate.value,
			...(type ? { type } : {}),
			primary: "primary" in candidate && candidate.primary === true,
		});
	}
	if (
		emails.filter((email) => email.primary).length !== 1 ||
		new Set(emails.map(createSCIMEmailTupleKey)).size !== emails.length
	) {
		return invalidStoredEmailState();
	}
	return emails;
}
