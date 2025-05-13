import { createAccessControl } from "../access";
import { defaultStatements, adminAc } from "../admin/access";

// Define available resources and their actions
const statement = {
    ...defaultStatements,
    project: ["create", "read", "update", "delete", "archive", "restore"],
    task: ["create", "read", "update", "delete", "assign", "complete"],
    team: ["create", "read", "update", "delete", "invite", "remove"],
    report: ["create", "read", "export", "share"],
    settings: ["read", "update"]
} as const;

// Create access control
const ac = createAccessControl(statement);

// Define custom roles
export const projectManager = ac.newRole({
    project: ["create", "read", "update", "archive", "restore"],
    task: ["create", "read", "update", "assign", "complete"],
    team: ["read", "invite", "remove"],
    report: ["create", "read", "export"],
    settings: ["read"]
});

export const teamLead = ac.newRole({
    project: ["read", "update"],
    task: ["create", "read", "update", "assign", "complete"],
    team: ["read", "invite"],
    report: ["read", "export"],
    settings: ["read"]
});

export const teamMember = ac.newRole({
    project: ["read"],
    task: ["read", "update", "complete"],
    team: ["read"],
    report: ["read"],
    settings: ["read"]
});

export const superAdmin = ac.newRole({
    ...adminAc.statements, // Include all admin permissions
    project: ["create", "read", "update", "delete", "archive", "restore"],
    task: ["create", "read", "update", "delete", "assign", "complete"],
    team: ["create", "read", "update", "delete", "invite", "remove"],
    report: ["create", "read", "export", "share"],
    settings: ["read", "update"]
});

// Export the access control and roles
export const customRoles = {
    ac,
    roles: {
        projectManager,
        teamLead,
        teamMember,
        superAdmin
    }
}; 