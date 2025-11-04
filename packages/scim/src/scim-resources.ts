import type { Account, User } from "better-auth";
import { SCIMUserResourceSchema } from "./user-schemas";

const getUserResourceLocation = (baseURL: string, userId: string) => {
	return;
};

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
			location: new URL(`/scim/v2/Users/${user.id}`, baseURL).toString(),
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
