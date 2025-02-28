import { createAccessControl } from "../../access";

export const defaultStatements = {
	user: ["create", "list", "set-role", "ban", "impersonate", "delete"],
	session: ["list", "revoke", "delete"],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	user: ["create", "list", "set-role", "ban", "impersonate", "delete"],
	session: ["list", "revoke", "delete"],
});

export const userAc = defaultAc.newRole({
	user: [],
	session: [],
});

export const defaultRoles = {
	admin: adminAc,
	user: userAc,
};
