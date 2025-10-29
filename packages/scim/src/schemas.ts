export const UserResourceSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				created: { type: "date" },
				lastModified: { type: "date" },
				location: { type: "string" },
			},
		},
		userName: { type: "string" },
		name: { type: "string" },
		displayName: { type: "string" },
		active: { type: "boolean" },
		emails: {
			type: "array",
			items: {
				type: "string",
			},
		},
		schemas: {
			type: "array",
			items: { type: "string" },
		},
	},
} as const;
