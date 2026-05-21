import type { DBFieldAttribute } from "@better-auth/core/db";
import type { AccessControl, Role } from "better-auth/plugins";
import type { Addon } from "../types";

export interface OrganizationClientAddon {
	id: string;
	serverAddon: Addon;
}

export interface OrganizationClientOptions {
	ac?: AccessControl | undefined;
	roles?:
		| {
				[key in string]: Role;
		  }
		| undefined;
	use: readonly OrganizationClientAddon[];
	schema?:
		| {
				organization?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				member?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				invitation?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				team?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
				organizationRole?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
		  }
		| undefined;
}
