import { defaultRoles } from "./access";
import type { OrganizationOptions } from "./organization";

type PermissionExclusive =
  | {
      /**
       * @deprecated Use `permissions` instead
       */
      permission: { [key: string]: string[] };
      permissions?: never;
    }
  | {
      permissions: { [key: string]: string[] };
      permission?: never;
    };

export const hasPermission = (
  input: {
    role: string;
    options: OrganizationOptions;
  } & PermissionExclusive,
) => {
  if (!input.permissions && !input.permission) {
    return false;
  }
  const roles = input.role.split(",");
  const acRoles = input.options.roles || defaultRoles;

  // Collect all permissions from all roles
  const userPermissions = new Set<string>();
  for (const role of roles) {
    const _role = acRoles[role as keyof typeof acRoles];
    if (_role?.permissions && Array.isArray(_role.permissions)) {
      _role.permissions.forEach((perm: string) => userPermissions.add(perm));
    }
    // For backward compatibility, also check for permission property
    if (_role?.permission && Array.isArray(_role.permission)) {
      _role.permission.forEach((perm: string) => userPermissions.add(perm));
    }
  }

  // Determine requested permissions
  const requested = input.permissions
    ? Object.values(input.permissions).flat()
    : Object.values(input.permission ?? {}).flat();

  // Check if user has all requested permissions
  const hasAll = requested.every((perm) => userPermissions.has(perm));
  return hasAll;
};
