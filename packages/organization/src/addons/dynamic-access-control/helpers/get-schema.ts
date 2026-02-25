import type {
	BetterAuthPluginDBSchema,
	DBPrimitive,
} from "@better-auth/core/db";
import type { DynamicAccessControlOptions } from "../types";

export const getAddonSchema = <Options extends DynamicAccessControlOptions>(
	options: Options,
) => {
	return {
		organizationRole: {
			modelName: options.schema?.organizationRole?.modelName,
			fields: {
				organizationId: {
					type: "string",
					required: true,
					references: {
						model: "organization",
						field: "id",
					},
					fieldName: options.schema?.organizationRole?.fields?.organizationId,
					index: true,
				},
				role: {
					type: "string",
					required: true,
					fieldName: options.schema?.organizationRole?.fields?.role,
				},
				permissions: {
					type: "string",
					required: true,
					fieldName: options.schema?.organizationRole?.fields?.permissions,
					transform: {
						input: (value: DBPrimitive) => {
							if (typeof value === "object" && value !== null) {
								return JSON.stringify(value);
							}
							return value;
						},
						output: (value: DBPrimitive) => {
							if (typeof value === "string") {
								return JSON.parse(value) as Record<string, string[]>;
							}
							return value;
						},
					},
				},
				createdAt: {
					type: "date",
					required: true,
					fieldName: options.schema?.organizationRole?.fields?.createdAt,
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options.schema?.organizationRole?.fields?.updatedAt,
					onUpdate: () => new Date(),
				},
				...(options.schema?.organizationRole?.additionalFields || {}),
			},
		},
	} satisfies BetterAuthPluginDBSchema;
};
