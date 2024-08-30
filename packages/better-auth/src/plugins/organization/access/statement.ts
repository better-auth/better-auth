import { AccessControl } from "./src/access";
import type { StatementsPrimitive } from "./src/types";

export const createAccessControl = <S extends StatementsPrimitive>(
	statements: S,
) => {
	return new AccessControl<S>(statements);
};

export const defaultStatements = {
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	organization: ["update"],
	invitation: ["create", "cancel"],
	member: ["create", "update", "delete"],
});

export const ownerAc = defaultAc.newRole({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
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
