import { createAccessControl } from "../../access";

export const defaultStatements = {
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	teamMember: ["create", "update", "delete", "read"],
	ac: ["create", "read", "update", "delete"],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	organization: ["update"],
	invitation: ["create", "cancel"],
	member: ["create", "update", "delete"],
	team: ["create", "update", "delete"],
	teamMember: ["create", "update", "delete", "read"],
	ac: ["create", "read", "update", "delete"],
});

export const ownerAc = defaultAc.newRole({
	organization: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	teamMember: ["create", "update", "delete", "read"],
	ac: ["create", "read", "update", "delete"],
});

export const memberAc = defaultAc.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	teamMember: ["read"],
	ac: ["read"], // Allow members to see all roles for their org.
});

export const defaultRoles = {
	admin: adminAc,
	owner: ownerAc,
	member: memberAc,
};
