export type DBFieldAttribute = {
	type: "string" | "number" | "boolean" | "date";
	required?: boolean;
	unique?: boolean;
	defaultValue?: any;
	input?: boolean;
	fieldName?: string;
	references?: {
		model: string;
		field: string;
	};
	returned?: boolean;
};

export const schema = (opts?: {
	ssoProvider?: {
		additionalFields?: Record<string, DBFieldAttribute>;
	};
}) => {
	return {
		ssoProvider: {
			fields: {
				issuer: {
					type: "string" as const,
					required: true,
				},
				oidcConfig: {
					type: "string" as const,
					required: false,
				},
				samlConfig: {
					type: "string" as const,
					required: false,
				},
				userId: {
					type: "string" as const,
					references: {
						model: "user",
						field: "id",
					},
				},
				providerId: {
					type: "string" as const,
					required: true,
					unique: true,
				},
				organizationId: {
					type: "string" as const,
					required: false,
				},
				domain: {
					type: "string" as const,
					required: true,
				},
				...(opts?.ssoProvider?.additionalFields ?? {}),
			},
		},
	};
};
