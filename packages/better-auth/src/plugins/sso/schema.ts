import type { AuthPluginSchema } from "../../types";
import type { FieldAttribute } from "../../db";

export const schema = (opts?: {
	ssoProvider?: {
		additionalFields?: Record<string, FieldAttribute>;
	};
}) => {
	return {
		ssoProvider: {
			fields: {
				issuer: {
					type: "string",
					required: true,
				},
				oidcConfig: {
					type: "string",
					required: false,
				},
				samlConfig: {
					type: "string",
					required: false,
				},
				userId: {
					type: "string",
					references: {
						model: "user",
						field: "id",
					},
				},
				providerId: {
					type: "string",
					required: true,
					unique: true,
				},
				organizationId: {
					type: "string",
					required: false,
				},
				domain: {
					type: "string",
					required: true,
				},
				...(opts?.ssoProvider?.additionalFields ?? {}),
			},
		},
	} satisfies AuthPluginSchema;
};
