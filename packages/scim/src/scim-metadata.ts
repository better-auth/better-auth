const MetadataFieldSupportOpenAPISchema = {
	type: "object",
	properties: {
		supported: {
			type: "boolean",
		},
	},
	required: ["supported"],
};

const BulkSupportOpenAPISchema = {
	type: "object",
	properties: {
		...MetadataFieldSupportOpenAPISchema.properties,
		maxOperations: {
			type: "integer",
		},
		maxPayloadSize: {
			type: "integer",
		},
	},
	required: ["supported", "maxOperations", "maxPayloadSize"],
};

const FilterSupportOpenAPISchema = {
	type: "object",
	properties: {
		...MetadataFieldSupportOpenAPISchema.properties,
		maxResults: {
			type: "integer",
		},
	},
	required: ["supported", "maxResults"],
};

export const ServiceProviderOpenAPISchema = {
	type: "object",
	properties: {
		patch: MetadataFieldSupportOpenAPISchema,
		bulk: BulkSupportOpenAPISchema,
		filter: FilterSupportOpenAPISchema,
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
					documentationUri: {
						type: "string",
					},
					type: {
						type: "string",
					},
					primary: {
						type: "boolean",
					},
				},
				required: ["type", "name", "description"],
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
				location: {
					type: "string",
				},
			},
		},
	},
	required: [
		"schemas",
		"patch",
		"bulk",
		"filter",
		"changePassword",
		"sort",
		"etag",
		"authenticationSchemes",
	] as string[],
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
		schemaExtensions: {
			type: "array",
			items: {
				type: "object",
				properties: {
					schema: { type: "string" },
					required: { type: "boolean" },
				},
				required: ["schema", "required"],
			},
		},
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				location: { type: "string" },
			},
		},
	},
	required: ["schemas", "name", "endpoint", "schema"] as string[],
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
		canonicalValues: {
			type: "array",
			items: { type: "string" },
		},
		referenceTypes: {
			type: "array",
			items: { type: "string" },
		},
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
	required: ["schemas", "id", "attributes"] as string[],
} as const;
