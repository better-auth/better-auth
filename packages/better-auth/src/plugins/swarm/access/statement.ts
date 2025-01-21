import { createAccessControl } from "./access";

export const defaultStatements = {
	swarm: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
} as const;

export const defaultAc = createAccessControl(defaultStatements);

export const adminAc = defaultAc.newRole({
	swarm: ["update"],
	invitation: ["create", "cancel"],
	member: ["create", "update", "delete"],
});

export const ownerAc = defaultAc.newRole({
	swarm: ["update", "delete"],
	member: ["create", "update", "delete"],
	invitation: ["create", "cancel"],
});

export const memberAc = defaultAc.newRole({
	swarm: [],
	member: [],
	invitation: [],
});

export const defaultRoles = {
	admin: adminAc,
	owner: ownerAc,
	member: memberAc,
};
