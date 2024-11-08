import { Role } from "./src/access";

export const permissionFromString = (permission?: string) => {
	return Role.fromString(permission ?? "");
};
