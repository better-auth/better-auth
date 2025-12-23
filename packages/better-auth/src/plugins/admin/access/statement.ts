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
	ac: ["create", "read", "read-own", "update", "delete"],
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
	ac: ["create", "read", "update", "delete"],
});

export const userAc = defaultAc.newRole({
	user: [],
	session: [],
	ac: ["read-own"], // Allow users to read their own roles
});

export const defaultRoles = {
	admin: adminAc,
	user: userAc,
};
