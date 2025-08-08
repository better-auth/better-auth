import type { AuthPluginSchema } from "../../types";

export const schema = (trustedDeviceStrategy: "in-db" | "in-cookie") =>
	({
		user: {
			fields: {
				twoFactorEnabled: {
					type: "boolean",
					required: false,
					defaultValue: false,
					input: false,
				},
			},
		},
		twoFactor: {
			fields: {
				secret: {
					type: "string",
					required: true,
					returned: false,
				},
				backupCodes: {
					type: "string",
					required: true,
					returned: false,
				},
				userId: {
					type: "string",
					required: true,
					returned: false,
					references: {
						model: "user",
						field: "id",
					},
				},
			},
		},
		...(trustedDeviceStrategy === "in-db"
			? {
					trustedDevice: {
						fields: {
							id: {
								type: "string",
								required: true,
								returned: true,
								unique: true,
							},
							userId: {
								type: "string",
								required: true,
								returned: false,
								unique: true,
							},
							userAgent: {
								type: "string",
								required: true,
								returned: true,
							},
							maxAge: {
								type: "string",
								required: true,
								returned: true,
							},
						},
					},
				}
			: {}),
	}) satisfies AuthPluginSchema;
