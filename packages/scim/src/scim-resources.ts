import type { Account, User } from "better-auth";
import { SCIMUserResourceSchema } from "./user-schemas";
import { getResourceURL } from "./utils";

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
			location: getResourceURL(`/scim/v2/Users/${user.id}`, baseURL),
		},

		// SCIM user resource
		// See https://datatracker.ietf.org/doc/html/rfc7643#section-4.1

		userName: user.email,
		name: {
			formatted: user.name,
		},
		displayName: user.name,
		// `active` reflects the enforced disabled-user state. Without the admin
		// plugin there is no `banned` column, so the user reads as active.
		active: !(user as User & { banned?: boolean | null }).banned,
		emails: [{ primary: true, value: user.email }],
		schemas: [SCIMUserResourceSchema.id],
	};
};
