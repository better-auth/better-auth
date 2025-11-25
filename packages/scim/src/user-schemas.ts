import * as z from "zod";

export const APIUserSchema = z.object({
	userName: z.string().lowercase(),
	externalId: z.string().optional(),
	name: z
		.object({
			formatted: z.string().optional(),
			givenName: z.string().optional(),
			familyName: z.string().optional(),
		})
		.optional(),
	emails: z
		.array(
			z.object({
				value: z.email(),
				primary: z.boolean().optional(),
			}),
		)
		.optional(),
});

export const OpenAPIUserResourceSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				created: { type: "string", format: "date-time" },
				lastModified: { type: "string", format: "date-time" },
				location: { type: "string" },
			},
		},
		userName: { type: "string" },
		name: {
			type: "object",
			properties: {
				formatted: { type: "string" },
				givenName: { type: "string" },
				familyName: { type: "string" },
			},
		},
		displayName: { type: "string" },
		active: { type: "boolean" },
		emails: {
			type: "array",
			items: {
				type: "object",
				properties: {
					value: { type: "string" },
					primary: { type: "boolean" },
				},
			},
		},
		schemas: {
			type: "array",
			items: { type: "string" },
		},
	},
} as const;

export const SCIMUserResourceSchema = {
	id: "urn:ietf:params:scim:schemas:core:2.0:User",
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
	name: "User",
	description: "User Account",
	attributes: [
		{
			name: "id",
			type: "string",
			multiValued: false,
			description: "Unique opaque identifier for the User",
			required: false,
			caseExact: true,
			mutability: "readOnly",
			returned: "default",
			uniqueness: "server",
		},
		{
			name: "userName",
			type: "string",
			multiValued: false,
			description:
				"Unique identifier for the User, typically used by the user to directly authenticate to the service provider",
			required: true,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "server",
		},
		{
			name: "displayName",
			type: "string",
			multiValued: false,
			description:
				"The name of the User, suitable for display to end-users.  The name SHOULD be the full name of the User being described, if known.",
			required: false,
			caseExact: true,
			mutability: "readOnly",
			returned: "default",
			uniqueness: "none",
		},
		{
			name: "active",
			type: "boolean",
			multiValued: false,
			description:
				"A Boolean value indicating the User's administrative status.",
			required: false,
			mutability: "readOnly",
			returned: "default",
		},
		{
			name: "name",
			type: "complex",
			multiValued: false,
			description: "The components of the user's real name.",
			required: false,
			subAttributes: [
				{
					name: "formatted",
					type: "string",
					multiValued: false,
					description:
						"The full name, including all middlenames, titles, and suffixes as appropriate, formatted for display(e.g., 'Ms. Barbara J Jensen, III').",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "familyName",
					type: "string",
					multiValued: false,
					description:
						"The family name of the User, or last name in most Western languages (e.g., 'Jensen' given the fullname 'Ms. Barbara J Jensen, III').",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "givenName",
					type: "string",
					multiValued: false,
					description:
						"The given name of the User, or first name in most Western languages (e.g., 'Barbara' given the full name 'Ms. Barbara J Jensen, III').",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
				},
			],
		},
		{
			name: "emails",
			type: "complex",
			multiValued: true,
			description:
				"Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
			required: false,
			subAttributes: [
				{
					name: "value",
					type: "string",
					multiValued: false,
					description:
						"Email addresses for the user.  The value SHOULD be canonicalized by the service provider, e.g., 'bjensen@example.com' instead of 'bjensen@EXAMPLE.COM'. Canonical type values of 'work', 'home', and 'other'.",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "server",
				},
				{
					name: "primary",
					type: "boolean",
					multiValued: false,
					description:
						"A Boolean value indicating the 'primary' or preferred attribute value for this attribute, e.g., the preferred mailing address or primary email address.  The primary attribute value 'true' MUST appear no more than once.",
					required: false,
					mutability: "readWrite",
					returned: "default",
				},
			],
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		},
	],
	meta: {
		resourceType: "Schema",
		location: "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User",
	},
};

export const SCIMUserResourceType = {
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
	id: "User",
	name: "User",
	endpoint: "/Users",
	description: "User Account",
	schema: "urn:ietf:params:scim:schemas:core:2.0:User",
	meta: {
		resourceType: "ResourceType",
		location: "/scim/v2/ResourceTypes/User",
	},
};
