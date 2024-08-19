import { AccessControl } from "./src/access";
import { StatementsPrimitive } from "./src/types";

export const createAccessControl = <S extends StatementsPrimitive>(
	statements: S,
) => {
	return new AccessControl<S>(statements);
};

export const defaultStatements = {
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "delete"],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	organization: ["update"],
	invitation: ["create", "delete"],
	member: ["create", "update", "delete"],
});

export const ownerAc = defaultAc.newRole({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "delete"],
});

export const memberAc = defaultAc.newRole({
	organization: [],
	member: [],
	invitation: [],
});

export const defaultRoles = {
	admin: adminAc,
	owner: ownerAc,
	member: memberAc,
};
