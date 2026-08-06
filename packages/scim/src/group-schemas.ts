import * as z from "zod";

const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

/**
 * Attribute-less Group marker sent by Microsoft's classic Entra provisioning
 * client. It is an input compatibility token, not a SCIM extension schema.
 */
const SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA =
	"http://schemas.microsoft.com/2006/11/ResourceManagement/ADSCIM/2.0/Group";

/** Maximum number of direct User members in one canonical SCIM Group. */
export const SCIM_MAX_GROUP_MEMBERS = 1_000;

const groupMemberSchema = z.object({
	value: z.string().min(1),
	type: z
		.string()
		.refine((type) => type.toLowerCase() === "user")
		.optional(),
});

export const APIGroupSchema = z.object({
	schemas: z
		.array(z.literal(SCIM_GROUP_SCHEMA))
		.length(1, "schemas must contain only the core SCIM Group schema"),
	externalId: z.string().min(1).optional(),
	displayName: z.string().trim().min(1),
	members: z.array(groupMemberSchema).max(SCIM_MAX_GROUP_MEMBERS).optional(),
});

export type MicrosoftEntraGroupSchemaNormalization =
	| { ok: true; body: unknown }
	| { ok: false; detail: string };

/**
 * Remove the exact classic Entra Group marker from an enabled POST request.
 * Marker attributes and duplicate marker declarations are always rejected.
 */
export function normalizeMicrosoftEntraGroupSchema(
	body: unknown,
	enabled: boolean,
): MicrosoftEntraGroupSchemaNormalization {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return { ok: true, body };
	}
	if (Object.hasOwn(body, SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA)) {
		return {
			ok: false,
			detail:
				"The Microsoft Entra Group compatibility schema cannot contain attributes",
		};
	}
	const schemas = Reflect.get(body, "schemas");
	if (!Array.isArray(schemas)) return { ok: true, body };
	const markerCount = schemas.filter(
		(schema) => schema === SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
	).length;
	if (markerCount === 0 || !enabled) return { ok: true, body };
	if (markerCount !== 1) {
		return {
			ok: false,
			detail:
				"The Microsoft Entra Group compatibility schema must not be duplicated",
		};
	}
	return {
		ok: true,
		body: {
			...body,
			schemas: schemas.filter(
				(schema) => schema !== SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
			),
		},
	};
}

export const OpenAPIGroupResourceSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		externalId: { type: "string" },
		displayName: { type: "string" },
		members: {
			type: "array",
			maxItems: SCIM_MAX_GROUP_MEMBERS,
			items: {
				type: "object",
				properties: {
					value: { type: "string" },
					$ref: { type: "string" },
					display: { type: "string" },
					type: { type: "string", enum: ["User"] },
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
	required: ["schemas", "id"] as string[],
} as const;

export const SCIMGroupResourceSchema = {
	id: "urn:ietf:params:scim:schemas:core:2.0:Group",
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
	name: "Group",
	description: "Group",
	attributes: [
		{
			name: "displayName",
			type: "string",
			multiValued: false,
			description: "A human-readable name for the Group.",
			required: true,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "server",
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
					required: true,
					caseExact: false,
					mutability: "immutable",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "$ref",
					type: "reference",
					referenceTypes: ["User"],
					multiValued: false,
					description: "The URI corresponding to a SCIM member resource.",
					required: false,
					caseExact: false,
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
					mutability: "readOnly",
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
					canonicalValues: ["User"],
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
