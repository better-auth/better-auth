import type { SCIMEmail, SCIMName } from "./types";

export const getAccountId = (userName: string, externalId?: string) => {
	return externalId ?? userName;
};

const getFormattedName = (name: SCIMName) => {
	if (name.givenName && name.familyName) {
		return `${name.givenName} ${name.familyName}`;
	}

	if (name.givenName) {
		return name.givenName;
	}

	return name.familyName ?? "";
};

export const getUserFullName = (
	email: string,
	name?: SCIMName,
	displayName?: string,
) => {
	if (name) {
		const formatted = name.formatted?.trim() ?? "";
		if (formatted.length > 0) {
			return formatted;
		}

		const combined = getFormattedName(name);
		if (combined) {
			return combined;
		}
	}

	// `displayName` mirrors the same underlying field as `name.formatted`
	// (see `createUserResource`'s `displayName: user.name`), so a client that
	// writes `displayName` without a structured `name` still resolves to a
	// real name instead of falling straight through to the email.
	const trimmedDisplayName = displayName?.trim() ?? "";
	if (trimmedDisplayName.length > 0) {
		return trimmedDisplayName;
	}

	return email;
};

export const getUserPrimaryEmail = (userName: string, emails?: SCIMEmail[]) => {
	return (
		emails?.find((email) => email.primary)?.value ??
		emails?.[0]?.value ??
		userName
	);
};
