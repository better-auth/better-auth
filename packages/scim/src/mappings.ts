import type { SCIMEmail, SCIMName } from "./types";

export const getAccountId = (userName: string, externalId?: string) => {
	return externalId ?? userName;
};

export const getFormattedName = (name: SCIMName) => {
	if (name.givenName && name.familyName) {
		return `${name.givenName} ${name.familyName}`;
	}

	if (name.givenName) {
		return name.givenName;
	}

	return name.familyName ?? "";
};

export const getUserFullName = (email: string, name?: SCIMName) => {
	return name ? (name.formatted ?? getFormattedName(name)) : email;
};

export const getUserPrimaryEmail = (userName: string, emails?: SCIMEmail[]) => {
	return (
		emails?.find((email) => email.primary)?.value ??
		emails?.[0]?.value ??
		userName
	);
};
