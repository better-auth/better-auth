import { createAccessControl } from "./access";

export const defaultStatements = {
	user: [
		"create",
		"list",
		"set-role",
		"ban",
		"list-sessions",
		"revoke-sessions",
		"impersonate",
		"delete",
	],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	user: [
		"create",
		"list",
		"set-role",
		"ban",
		"list-sessions",
		"revoke-sessions",
		"impersonate",
		"delete",
	],
});

export const userAc = defaultAc.newRole({
	user: [],
});

export const defaultRoles = {
	admin: adminAc,
	user: userAc,
};
