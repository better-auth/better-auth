import type { Account, User } from "better-auth";
import type { SCIMEmail, SCIMName } from "./types";
import { SCIMUserResourceSchema } from "./user-schemas";

export const createUserResource = (
	baseURL: string,
	user: User,
	account?: Account | null,
) => {
	return {
		// Common attributes
		// See https://datatracker.ietf.org/doc/html/rfc7643#section-3.1

		id: user.id,
		externalId: account?.accountId,
		meta: {
			resourceType: "User",
			created: user.createdAt,
			lastModified: user.updatedAt,
			location: getUserResourceLocation(baseURL, user.id),
		},

		// SCIM user resource
		// See https://datatracker.ietf.org/doc/html/rfc7643#section-4.1

		userName: user.email,
		name: {
			formatted: user.name,
		},
		displayName: user.name,
		active: true,
		emails: [{ primary: true, value: user.email }],
		schemas: [SCIMUserResourceSchema.id],
	};
};

export const getUserResourceLocation = (baseURL: string, userId: string) => {
	return new URL(`/scim/v2/Users/${userId}`, baseURL).toString();
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

export const getUserPrimaryEmail = (emails?: SCIMEmail[]) => {
	return emails?.find((email) => email.primary)?.value ?? emails?.[0]?.value;
};
