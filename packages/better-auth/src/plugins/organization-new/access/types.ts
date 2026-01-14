import type { OrganizationOptions } from "../types";

export type InferOrganizationRolesFromOption<
	O extends OrganizationOptions | undefined,
> = O extends { roles: any }
	? keyof O["roles"] extends infer K extends string
		? K
		: "admin" | "member" | "owner"
	: "admin" | "member" | "owner";
