import * as z from "zod";
import { createSCIMEmailTupleKey } from "./user-profile";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const scimEmailValueSchema = z.email().max(254);

export const APIUserSchema = z
	.object({
		schemas: z
			.array(z.literal(SCIM_USER_SCHEMA))
			.length(1, "schemas must contain only the core SCIM User schema"),
		userName: z.string().trim().min(1),
		externalId: z.string().min(1).optional(),
		displayName: z.string().trim().min(1).optional(),
		name: z
			.object({
				formatted: z.string().trim().min(1).optional(),
				givenName: z.string().trim().min(1).optional(),
				familyName: z.string().trim().min(1).optional(),
			})
			.optional(),
		emails: z
			.array(
				z.object({
					value: scimEmailValueSchema,
					primary: z.boolean().optional(),
					type: z.string().trim().min(1).optional(),
				}),
			)
			.max(20)
			.refine((emails) => emails.filter((email) => email.primary).length <= 1, {
				message: "emails cannot contain multiple primary values",
			})
			.refine(
				(emails) =>
					new Set(emails.map(createSCIMEmailTupleKey)).size === emails.length,
				{ message: "emails cannot contain duplicate type and value pairs" },
			)
			.optional(),
		active: z.boolean().optional(),
	})
	.superRefine((user, context) => {
		if (
			(user.emails === undefined || user.emails.length === 0) &&
			!scimEmailValueSchema.safeParse(user.userName).success
		) {
			context.addIssue({
				code: "custom",
				path: ["emails"],
				message:
					"emails must contain an email when userName is not an email address",
			});
		}
	});

export const OpenAPIUserResourceSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		externalId: { type: "string" },
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
					type: { type: "string" },
				},
			},
		},
		schemas: {
			type: "array",
			items: { type: "string" },
		},
	},
	required: ["schemas", "id"] as string[],
} as const;

export const SCIMUserResourceSchema = {
	id: "urn:ietf:params:scim:schemas:core:2.0:User",
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
	name: "User",
	description: "User Account",
	attributes: [
		{
			name: "userName",
			type: "string",
			multiValued: false,
			description:
				"Unique identifier for the User within its provisioning connection.",
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
			caseExact: false,
			mutability: "readWrite",
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
			mutability: "readWrite",
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
					name: "givenName",
					type: "string",
					multiValued: false,
					description: "The given name of the User.",
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
					description: "The family name of the User.",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
				},
			],
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
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
					required: true,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
				},
				{
					name: "type",
					type: "string",
					multiValued: false,
					description:
						"A label indicating the attribute's function, such as work or home.",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
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
