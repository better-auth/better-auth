import { Role } from "./src/access";
import { Statements } from "./statement";

export const permissionFromString = (permission?: string) => {
    return Role.fromString<Statements>(permission ?? "");
};
