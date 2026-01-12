import type { ResolvedOrganizationOptions } from "../types";

export type InferOrganizationRolesFromOption<
	O extends ResolvedOrganizationOptions | undefined,
> = O extends { roles: any }
	? keyof O["roles"] extends infer K extends string
		? K
		: "admin" | "member" | "owner"
	: "admin" | "member" | "owner";
