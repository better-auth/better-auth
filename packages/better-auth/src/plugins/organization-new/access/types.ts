import type { OrganizationOptions } from "../types";

type DefaultRoles = "admin" | "member" | "owner";

export type InferOrganizationRolesFromOption<
	O extends OrganizationOptions | undefined,
> = O extends { roles: any }
	? keyof O["roles"] extends infer K extends string
		? K | DefaultRoles
		: DefaultRoles
	: DefaultRoles;
