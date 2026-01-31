import type { SCIMEmail, SCIMName } from "./types";

export const getAccountId = (userName: string, externalId?: string) => {
	return externalId ?? userName;
};

const getFormattedName = (name: SCIMName): string | undefined => {
	if (name.givenName && name.familyName) {
		return `${name.givenName} ${name.familyName}`;
	}
	if (name.givenName) {
		return name.givenName;
	}
	return name.familyName;
};

export const getUserFullName = (name?: SCIMName): string | undefined => {
	if (!name) {
		return undefined;
	}
	const formatted = name.formatted?.trim();
	if (formatted) {
		return formatted;
	}
	return getFormattedName(name);
};

export const getUserPrimaryEmail = (userName: string, emails?: SCIMEmail[]) => {
	return (
		emails?.find((email) => email.primary)?.value ??
		emails?.[0]?.value ??
		userName
	);
};
