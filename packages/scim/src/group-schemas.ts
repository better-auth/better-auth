import * as z from "zod";

const groupMemberSchema = z.object({
	value: z.string().optional(),
	$ref: z.string().optional(),
	display: z.string().optional(),
	type: z.string().optional(),
});

export const APIGroupSchema = z.object({
	externalId: z.string().optional(),
	displayName: z.string().min(1),
	members: z.array(groupMemberSchema).optional(),
});

export const OpenAPIGroupResourceSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		externalId: { type: "string" },
		displayName: { type: "string" },
		members: {
			type: "array",
			items: {
				type: "object",
				properties: {
					value: { type: "string" },
					$ref: { type: "string" },
					display: { type: "string" },
					type: { type: "string" },
				},
			},
		},
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				created: { type: "string", format: "date-time" },
				lastModified: { type: "string", format: "date-time" },
				location: { type: "string" },
			},
		},
		schemas: {
			type: "array",
			items: { type: "string" },
		},
	},
} as const;

export const SCIMGroupResourceSchema = {
	id: "urn:ietf:params:scim:schemas:core:2.0:Group",
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
	name: "Group",
	description: "Group",
	attributes: [
		{
			name: "id",
			type: "string",
			multiValued: false,
			description: "Unique opaque identifier for the Group",
			required: false,
			caseExact: true,
			mutability: "readOnly",
			returned: "default",
			uniqueness: "server",
		},
		{
			name: "externalId",
			type: "string",
			multiValued: false,
			description:
				"An identifier for the Group as defined by the provisioning client.",
			required: false,
			caseExact: true,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		},
		{
			name: "displayName",
			type: "string",
			multiValued: false,
			description: "A human-readable name for the Group.",
			required: true,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		},
		{
			name: "members",
			type: "complex",
			multiValued: true,
			description: "A list of members of the Group.",
			required: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
			subAttributes: [
				{
					name: "value",
					type: "string",
					multiValued: false,
					description: "Identifier of the member of this Group.",
					required: false,
					caseExact: true,
					mutability: "immutable",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "$ref",
					type: "reference",
					multiValued: false,
					description: "The URI corresponding to a SCIM member resource.",
					required: false,
					caseExact: true,
					mutability: "immutable",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "display",
					type: "string",
					multiValued: false,
					description: "A human-readable name for the member.",
					required: false,
					caseExact: false,
					mutability: "immutable",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "type",
					type: "string",
					multiValued: false,
					description: "A label indicating the member resource type.",
					required: false,
					caseExact: false,
					mutability: "immutable",
					returned: "default",
					uniqueness: "none",
				},
			],
		},
	],
	meta: {
		resourceType: "Schema",
		location: "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group",
	},
};

export const SCIMGroupResourceType = {
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
	id: "Group",
	name: "Group",
	endpoint: "/Groups",
	description: "Group",
	schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
	meta: {
		resourceType: "ResourceType",
		location: "/scim/v2/ResourceTypes/Group",
	},
};
