import type { Account, User } from "better-auth";
import { SCIMGroupResourceSchema } from "./group-schemas";
import type {
	SCIMGroup,
	SCIMGroupMemberReference,
	SCIMUserGroupReference,
} from "./types";
import { SCIMUserResourceSchema } from "./user-schemas";
import { getResourceURL } from "./utils";

export const createUserResource = (
	baseURL: string,
	user: User,
	account?: Account | null,
	groups?: SCIMUserGroupReference[],
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
		...(groups && groups.length > 0 ? { groups } : {}),
		schemas: [SCIMUserResourceSchema.id],
	};
};

export const createGroupResource = (
	baseURL: string,
	group: SCIMGroup,
	members: SCIMGroupMemberReference[],
) => {
	return {
		id: group.scimGroupId,
		...(group.externalId ? { externalId: group.externalId } : {}),
		displayName: group.displayName,
		members,
		meta: {
			resourceType: "Group",
			created: group.createdAt,
			lastModified: group.updatedAt ?? group.createdAt,
			location: getResourceURL(
				`/scim/v2/Groups/${encodeURIComponent(group.scimGroupId)}`,
				baseURL,
			),
		},
		schemas: [SCIMGroupResourceSchema.id],
	};
};
