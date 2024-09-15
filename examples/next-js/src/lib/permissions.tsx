import { createAccessControl } from "better-auth/plugins/access";

export const s = "" as const;

export const ac = createAccessControl({
	project: ["create", "share", "delete"],
});

export const member = ac.newRole({
	project: ["create"],
});

export const owner = ac.newRole({
	project: ["create", "share", "delete"],
});

export const admin = ac.newRole({
	project: ["create", "share"],
});


