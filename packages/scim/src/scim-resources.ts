import type { Account } from "better-auth";
import type { UserWithActive } from "./types";
import { SCIMUserResourceSchema } from "./user-schemas";
import { getResourceURL } from "./utils";

export const createUserResource = (
	baseURL: string,
	user: UserWithActive,
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
		active: user.active ?? true,
		emails: [{ primary: true, value: user.email }],
		schemas: [SCIMUserResourceSchema.id],
	};
};
