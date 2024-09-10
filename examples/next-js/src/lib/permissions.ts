import { createAccessControl } from "better-auth/plugins/access";

const statement = {
	project: ["create", "share", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
	project: ["create"],
});

export const owner = ac.newRole({
	project: ["create", "share", "delete"],
});

export const admin = ac.newRole({
	project: ["create", "share"],
});
