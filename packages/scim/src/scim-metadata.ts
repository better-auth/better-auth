const MetadataFieldSupportOpenAPISchema = {
	type: "object",
	properties: {
		supported: {
			type: "boolean",
		},
	},
};

export const ServiceProviderOpenAPISchema = {
	type: "object",
	properties: {
		patch: MetadataFieldSupportOpenAPISchema,
		bulk: MetadataFieldSupportOpenAPISchema,
		filter: MetadataFieldSupportOpenAPISchema,
		changePassword: MetadataFieldSupportOpenAPISchema,
		sort: MetadataFieldSupportOpenAPISchema,
		etag: MetadataFieldSupportOpenAPISchema,
		authenticationSchemes: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: {
						type: "string",
					},
					description: {
						type: "string",
					},
					specUri: {
						type: "string",
					},
					type: {
						type: "string",
					},
					primary: {
						type: "boolean",
					},
				},
			},
		},
		schemas: {
			type: "array",
			items: {
				type: "string",
			},
		},
		meta: {
			type: "object",
			properties: {
				resourceType: {
					type: "string",
				},
			},
		},
	},
} as const;

export const ResourceTypeOpenAPISchema = {
	type: "object",
	properties: {
		schemas: {
			type: "array",
			items: { type: "string" },
		},
		id: { type: "string" },
		name: { type: "string" },
		endpoint: { type: "string" },
		description: { type: "string" },
		schema: { type: "string" },
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				location: { type: "string" },
			},
		},
	},
} as const;

const SCIMSchemaAttributesOpenAPISchema = {
	type: "object",
	properties: {
		name: { type: "string" },
		type: { type: "string" },
		multiValued: { type: "boolean" },
		description: { type: "string" },
		required: { type: "boolean" },
		caseExact: { type: "boolean" },
		mutability: { type: "string" },
		returned: { type: "string" },
		uniqueness: { type: "string" },
	},
} as const;

export const SCIMSchemaOpenAPISchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		schemas: {
			type: "array",
			items: { type: "string" },
		},
		name: { type: "string" },
		description: { type: "string" },
		attributes: {
			type: "array",
			items: {
				...SCIMSchemaAttributesOpenAPISchema,
				properties: {
					...SCIMSchemaAttributesOpenAPISchema.properties,
					subAttributes: {
						type: "array",
						items: SCIMSchemaAttributesOpenAPISchema,
					},
				},
			},
		},
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				location: { type: "string" },
			},
			required: ["resourceType", "location"],
		},
	},
} as const;
