import type { DBFieldAttribute } from "@better-auth/core/db";
import type { OrganizationRole } from "./schema";

export interface DynamicAccessControlOptions {
	schema?:
		| {
				modelName?: string;
				fields?: {
					[key in keyof Omit<OrganizationRole, "id">]?: string;
				};
				additionalFields?: {
					[key in string]: DBFieldAttribute;
				};
		  }
		| undefined;
}
