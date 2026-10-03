import type {
	SCIMCanonicalEmail,
	SCIMCanonicalName,
	SCIMEmail,
} from "./configuration";
import { createScopedKey } from "./resource-key";
import type { APIUser, SCIMCanonicalUserAttributes } from "./user-schemas";
import { SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR } from "./user-schemas";

/** Canonical provider-owned profile fields stored on a SCIM User. */
export interface CanonicalSCIMUserProfile {
	userName: string;
	displayName: string;
	formattedName: string;
	name: SCIMCanonicalName;
	emails: SCIMCanonicalEmail[];
	primaryEmail: string;
	attributes: SCIMCanonicalUserAttributes;
}

function normalizeOptionalString(value?: string): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

/** Normalize the supported multi-valued email set and select one primary. */
export function normalizeSCIMEmails(
	userName: string,
	emails?: readonly SCIMEmail[],
): SCIMCanonicalEmail[] {
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
	input: APIUser,
): CanonicalSCIMUserProfile {
	const userName = input.userName.trim();
	const emails = normalizeSCIMEmails(userName, input.emails);
	const primaryEmail =
		emails.find((email) => email.primary)?.value ??
		emails[0]?.value ??
		userName;
	const givenName = normalizeOptionalString(input.name?.givenName);
	const familyName = normalizeOptionalString(input.name?.familyName);
	const middleName = normalizeOptionalString(input.name?.middleName);
	const honorificPrefix = normalizeOptionalString(input.name?.honorificPrefix);
	const honorificSuffix = normalizeOptionalString(input.name?.honorificSuffix);
	const composedName = [givenName, familyName].filter(Boolean).join(" ");
	const formattedName =
		normalizeOptionalString(input.name?.formatted) ??
		normalizeOptionalString(input.displayName) ??
		(composedName || primaryEmail);
	const displayName =
		normalizeOptionalString(input.displayName) ?? formattedName;
	const name = {
		formatted: formattedName,
		...(givenName ? { givenName } : {}),
		...(familyName ? { familyName } : {}),
		...(middleName ? { middleName } : {}),
		...(honorificPrefix ? { honorificPrefix } : {}),
		...(honorificSuffix ? { honorificSuffix } : {}),
	};
	const attributes: SCIMCanonicalUserAttributes = {
		schemas: input.schemas,
		name,
		emails,
		...(input.title ? { title: input.title } : {}),
		...(input.userType ? { userType: input.userType } : {}),
		...(input.preferredLanguage
			? { preferredLanguage: input.preferredLanguage }
			: {}),
		...(input.locale ? { locale: input.locale } : {}),
		...(input.timezone ? { timezone: input.timezone } : {}),
		...(input.phoneNumbers ? { phoneNumbers: input.phoneNumbers } : {}),
		...(input.addresses ? { addresses: input.addresses } : {}),
		...(input.roles ? { roles: input.roles } : {}),
		...(input.entitlements ? { entitlements: input.entitlements } : {}),
		...(input[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.id]
			? {
					[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.canonicalAttribute]:
						input[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.id],
				}
			: {}),
	};

	return {
		userName,
		displayName,
		formattedName,
		name,
		emails,
		primaryEmail,
		attributes,
	};
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
