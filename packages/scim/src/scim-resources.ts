import type { Account, User } from "better-auth";
import { SCIMGroupResourceSchema } from "./group-schemas";
import type { SCIMGroupMembership } from "./types";
import { SCIMUserResourceSchema } from "./user-schemas";
import { getResourceURL } from "./utils";

export const createUserResource = (
	baseURL: string,
	user: User,
	account?: Account | null,
	groups?: SCIMGroupMembership[],
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
		active: true,
		emails: [{ primary: true, value: user.email }],
		...(groups ? { groups } : {}),
		schemas: [SCIMUserResourceSchema.id],
	};
};

export const createGroupResource = (
	baseURL: string,
	group: {
		id: string;
		displayName?: string;
		externalId?: string | undefined;
		members?: SCIMGroupMembership[];
	},
) => {
	return {
		id: group.id,
		...(group.externalId ? { externalId: group.externalId } : {}),
		displayName: group.displayName ?? group.id,
		members: group.members ?? [],
		meta: {
			resourceType: "Group",
			location: getResourceURL(
				`/scim/v2/Groups/${encodeURIComponent(group.id)}`,
				baseURL,
			),
		},
		schemas: [SCIMGroupResourceSchema.id],
	};
};
