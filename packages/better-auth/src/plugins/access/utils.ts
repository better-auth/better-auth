import { Role } from "./access";

export const permissionFromString = (permission?: string) => {
	return Role.fromString(permission ?? "");
};
