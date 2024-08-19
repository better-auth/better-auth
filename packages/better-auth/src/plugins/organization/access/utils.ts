import { OrganizationOptions } from "../organization";
import { Role } from "./src/access";
import { defaultRoles } from "./statement";

export const permissionFromString = (permission?: string) => {
	return Role.fromString(permission ?? "");
};
