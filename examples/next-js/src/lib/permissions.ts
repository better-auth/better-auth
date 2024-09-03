import { organization } from "better-auth/plugins";
import { createAccessControl, AccessControl } from "better-auth/plugins/access";

const statement = {
	project: ["create"],
};

const ac = createAccessControl(statement);

const member = ac.newRole({
	project: ["create"],
});

const owner = ac.newRole({
	project: ["create", "share", "delete"],
});

const admin = ac.newRole({
	project: ["create", "share", "delete"],
});

organization({
	ac,
	roles: {
		member,
		owner,
		admin,
	},
});
