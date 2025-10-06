import { createAccessControl } from "../../access";

export const defaultStatements = {
	user: [
		"create",
		"list",
		"set-role",
		"ban",
		"impersonate",
		"delete",
		"set-password",
		"get",
		"update",
	],
	session: ["list", "revoke", "delete"],
	organization: ["admin-list"],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	user: [
		"create",
		"list",
		"set-role",
		"ban",
		"impersonate",
		"delete",
		"set-password",
		"get",
		"update",
	],
	session: ["list", "revoke", "delete"],
	organization: ["admin-list"],
});

export const userAc = defaultAc.newRole({
	user: [],
	session: [],
	organization: [],
});

export const defaultRoles = {
	admin: adminAc,
	user: userAc,
};
