import * as z from "zod";
import { createSCIMEmailTupleKey } from "./user-email";

const SCIM_SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema";
const SCIM_RESOURCE_TYPE_SCHEMA =
	"urn:ietf:params:scim:schemas:core:2.0:ResourceType";

/** Standard SCIM core User schema URI. */
export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";

/** Standard SCIM Enterprise User extension schema URI. */
export const SCIM_ENTERPRISE_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";

/** Maximum serialized size of one canonical SCIM User attribute payload. */
export const SCIM_MAX_SERIALIZED_USER_ATTRIBUTES_LENGTH = 65_535;

const SCIM_MAX_MULTI_VALUE_COUNT = 20;
const SCIM_MAX_STRUCTURED_VALUE_COUNT = 10;
const scimStringSchema = z.string().trim().min(1).max(256);
const scimLongStringSchema = z.string().trim().min(1).max(1_024);
const scimReferenceSchema = z.string().trim().min(1).max(2_048);
const scimEmailValueSchema = z.email().max(254);

/**
 * Unwrap a single-element array before validation. Microsoft Entra sometimes
 * wraps a single-valued attribute's PATCH replace value in an array.
 */
function scimSingleValueScalar<Schema extends z.ZodType>(schema: Schema) {
	return z.preprocess(
		(value) => (Array.isArray(value) && value.length === 1 ? value[0] : value),
		schema,
	);
}

function atMostOnePrimary<T extends { primary?: boolean }>(
	values: readonly T[],
): boolean {
	return values.filter((value) => value.primary).length <= 1;
}

function primaryRefinement<T extends { primary?: boolean }>() {
	return (values: readonly T[]) => atMostOnePrimary(values);
}

/**
 * Whether every defined complex-value type occurs at most once,
 * case-insensitively. Untyped values do not participate in this constraint.
 */
export function hasUniqueSCIMDefinedTypes(
	values: readonly { type?: string }[],
): boolean {
	const definedTypes = values.flatMap((value) =>
		value.type === undefined ? [] : [value.type.trim().toLowerCase()],
	);
	return new Set(definedTypes).size === definedTypes.length;
}

export interface SCIMDiscoveryAttribute {
	name: string;
	subAttributes?: readonly SCIMDiscoveryAttribute[];
	[key: string]: unknown;
}

const scimNameSchema = z.object({
	formatted: scimLongStringSchema.optional(),
	givenName: scimStringSchema.optional(),
	familyName: scimStringSchema.optional(),
	middleName: scimStringSchema.optional(),
	honorificPrefix: scimStringSchema.optional(),
	honorificSuffix: scimStringSchema.optional(),
});

const scimCanonicalNameSchema = scimNameSchema.extend({
	formatted: scimLongStringSchema,
});

const scimEmailSchema = z.object({
	value: scimEmailValueSchema,
	primary: z.boolean().optional(),
	type: scimStringSchema.transform((type) => type.toLowerCase()).optional(),
});

const scimCanonicalEmailSchema = scimEmailSchema.extend({
	primary: z.boolean(),
});

const scimPhoneNumberSchema = z.object({
	value: scimLongStringSchema,
	type: scimStringSchema.transform((type) => type.toLowerCase()).optional(),
	primary: z.boolean().optional(),
});

const scimAddressSchema = z
	.object({
		formatted: scimLongStringSchema.optional(),
		streetAddress: scimLongStringSchema.optional(),
		locality: scimStringSchema.optional(),
		region: scimStringSchema.optional(),
		postalCode: scimStringSchema.optional(),
		country: scimStringSchema.optional(),
		type: scimStringSchema.transform((type) => type.toLowerCase()).optional(),
		primary: z.boolean().optional(),
	})
	.refine(
		(address) =>
			Object.entries(address).some(
				([attribute, value]) =>
					attribute !== "primary" &&
					attribute !== "type" &&
					value !== undefined,
			),
		{ message: "addresses must contain at least one address value" },
	);

const scimRoleSchema = z.object({
	value: scimLongStringSchema,
	display: scimLongStringSchema.optional(),
	type: scimStringSchema.transform((type) => type.toLowerCase()).optional(),
	primary: z.boolean().optional(),
});

const scimEntitlementSchema = scimRoleSchema;

const scimCanonicalManagerSchema = z
	.object({
		value: scimStringSchema.optional(),
		$ref: scimReferenceSchema.optional(),
	})
	.refine(
		(manager) => manager.value !== undefined || manager.$ref !== undefined,
		{
			message: "manager must contain value or $ref",
		},
	)
	.transform((manager) => {
		if (manager.value !== undefined) {
			return {
				value: manager.value,
				...(manager.$ref === undefined ? {} : { $ref: manager.$ref }),
			};
		}
		if (manager.$ref !== undefined) return { $ref: manager.$ref };
		throw new Error("Validated manager is missing value and $ref");
	});

const scimManagerInputObjectSchema = z.object({
	value: scimStringSchema.optional(),
	$ref: scimReferenceSchema.optional(),
	displayName: scimLongStringSchema.optional(),
});

const scimManagerInputSchema = z
	.union([
		scimStringSchema,
		scimManagerInputObjectSchema,
		z.array(scimManagerInputObjectSchema).length(1),
	])
	.transform((manager) => {
		if (typeof manager === "string") return { value: manager };
		const candidate = Array.isArray(manager) ? manager[0] : manager;
		if (!candidate) return undefined;
		const { value, $ref } = candidate;
		if (value !== undefined) {
			return { value, ...($ref === undefined ? {} : { $ref }) };
		}
		if ($ref !== undefined) return { $ref };
		return undefined;
	});

const scimEnterpriseUserAttributeShape = {
	employeeNumber: scimSingleValueScalar(scimStringSchema).optional(),
	costCenter: scimSingleValueScalar(scimStringSchema).optional(),
	organization: scimSingleValueScalar(scimLongStringSchema).optional(),
	division: scimSingleValueScalar(scimLongStringSchema).optional(),
	department: scimSingleValueScalar(scimLongStringSchema).optional(),
};

export const SCIMEnterpriseUserInputSchema = z
	.object({
		...scimEnterpriseUserAttributeShape,
		manager: scimManagerInputSchema.optional(),
	})
	.transform(({ manager, ...enterprise }) => ({
		...enterprise,
		...(manager === undefined ? {} : { manager }),
	}));

const SCIMEnterpriseUserCanonicalSchema = z.object({
	...scimEnterpriseUserAttributeShape,
	manager: scimCanonicalManagerSchema.optional(),
});

function stringAttribute(
	name: string,
	description: string,
	options: {
		required?: boolean;
		mutability?: "readOnly" | "readWrite";
		uniqueness?: "none" | "server";
	} = {},
) {
	return {
		name,
		type: "string",
		multiValued: false,
		description,
		required: options.required ?? false,
		caseExact: false,
		mutability: options.mutability ?? "readWrite",
		returned: "default",
		uniqueness: options.uniqueness ?? "none",
	};
}

function typeSubAttribute() {
	return {
		...stringAttribute("type", "A label indicating the attribute's function."),
	};
}

function primarySubAttribute() {
	return {
		name: "primary",
		type: "boolean",
		multiValued: false,
		description: "Whether this is the primary value for the attribute.",
		required: false,
		mutability: "readWrite",
		returned: "default",
	};
}

function multiValuedAttribute(
	name: string,
	description: string,
	subAttributes: readonly SCIMDiscoveryAttribute[],
) {
	return {
		name,
		type: "complex",
		multiValued: true,
		description,
		required: false,
		subAttributes,
		mutability: "readWrite",
		returned: "default",
		uniqueness: "none",
	};
}

export const SCIMUserResourceSchema = {
	id: SCIM_USER_SCHEMA,
	schemas: [SCIM_SCHEMA_SCHEMA],
	name: "User",
	description: "User Account",
	attributes: [
		stringAttribute(
			"userName",
			"Unique identifier for the User within its provisioning connection.",
			{ required: true, uniqueness: "server" },
		),
		stringAttribute(
			"displayName",
			"The name of the User, suitable for display to end-users.",
		),
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
			description: "The components of the User's real name.",
			required: false,
			subAttributes: [
				stringAttribute("formatted", "The complete formatted name."),
				stringAttribute("givenName", "The given name of the User."),
				stringAttribute("familyName", "The family name of the User."),
				stringAttribute("middleName", "The middle name of the User."),
				stringAttribute("honorificPrefix", "The honorific prefix of the User."),
				stringAttribute("honorificSuffix", "The honorific suffix of the User."),
			],
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		},
		multiValuedAttribute("emails", "Email addresses for the User.", [
			stringAttribute("value", "Email address for the User.", {
				required: true,
			}),
			typeSubAttribute(),
			primarySubAttribute(),
		]),
		stringAttribute("title", "The User's title."),
		stringAttribute("userType", "The User's relationship to the organization."),
		stringAttribute(
			"preferredLanguage",
			"The User's preferred written or spoken language.",
		),
		stringAttribute("locale", "The User's default location."),
		stringAttribute("timezone", "The User's time zone."),
		multiValuedAttribute("phoneNumbers", "Phone numbers for the User.", [
			stringAttribute("value", "Phone number for the User.", {
				required: true,
			}),
			typeSubAttribute(),
			primarySubAttribute(),
		]),
		multiValuedAttribute("addresses", "Postal addresses for the User.", [
			stringAttribute("formatted", "The complete formatted address."),
			stringAttribute("streetAddress", "The full street address."),
			stringAttribute("locality", "The city or locality."),
			stringAttribute("region", "The state or region."),
			stringAttribute("postalCode", "The postal code."),
			stringAttribute("country", "The country."),
			typeSubAttribute(),
			primarySubAttribute(),
		]),
		multiValuedAttribute("roles", "Roles for the User.", [
			stringAttribute("value", "The role value.", { required: true }),
			stringAttribute("display", "A human-readable role name."),
			typeSubAttribute(),
			primarySubAttribute(),
		]),
		multiValuedAttribute("entitlements", "Entitlements for the User.", [
			stringAttribute("value", "The entitlement value.", { required: true }),
			stringAttribute("display", "A human-readable entitlement name."),
			typeSubAttribute(),
			primarySubAttribute(),
		]),
	],
	meta: {
		resourceType: "Schema",
		location: `/scim/v2/Schemas/${SCIM_USER_SCHEMA}`,
	},
};

export const SCIMEnterpriseUserResourceSchema = {
	id: SCIM_ENTERPRISE_USER_SCHEMA,
	schemas: [SCIM_SCHEMA_SCHEMA],
	name: "EnterpriseUser",
	description: "Enterprise User",
	attributes: [
		stringAttribute("employeeNumber", "A number assigned to the User."),
		stringAttribute("costCenter", "The User's cost center."),
		stringAttribute("organization", "The User's organization."),
		stringAttribute("division", "The User's division."),
		stringAttribute("department", "The User's department."),
		{
			name: "manager",
			type: "complex",
			multiValued: false,
			description: "The User's manager.",
			required: false,
			subAttributes: [
				stringAttribute("value", "The manager's identifier.", {
					required: false,
				}),
				{
					name: "$ref",
					type: "reference",
					referenceTypes: ["User"],
					multiValued: false,
					description: "The URI of the manager's SCIM User resource.",
					required: false,
					caseExact: false,
					mutability: "readWrite",
					returned: "default",
					uniqueness: "none",
				},
				stringAttribute("displayName", "The manager's display name.", {
					mutability: "readOnly",
				}),
			],
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		},
	],
	meta: {
		resourceType: "Schema",
		location: `/scim/v2/Schemas/${SCIM_ENTERPRISE_USER_SCHEMA}`,
	},
};

const OpenAPIEnterpriseUserSchema = {
	type: "object",
	properties: {
		employeeNumber: { type: "string", maxLength: 256 },
		costCenter: { type: "string", maxLength: 256 },
		organization: { type: "string", maxLength: 1_024 },
		division: { type: "string", maxLength: 1_024 },
		department: { type: "string", maxLength: 1_024 },
		manager: {
			type: "object",
			properties: {
				value: { type: "string", maxLength: 256 },
				$ref: { type: "string", maxLength: 2_048 },
			},
		},
	},
} as const;

/**
 * Complete protocol and storage behavior for the standard Enterprise User
 * extension.
 */
export const SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR = {
	kind: "extension",
	id: SCIM_ENTERPRISE_USER_SCHEMA,
	required: false,
	inputPathAliases: [
		{
			path: "manager",
			relativePath: "manager",
		},
	],
	inputSchema: SCIMEnterpriseUserInputSchema,
	canonicalSchema: SCIMEnterpriseUserCanonicalSchema,
	canonicalAttribute: "enterprise",
	responseAttribute: SCIM_ENTERPRISE_USER_SCHEMA,
	discoverySchema: SCIMEnterpriseUserResourceSchema,
	openAPISchema: OpenAPIEnterpriseUserSchema,
} as const;

const SCIM_CORE_USER_SCHEMA_DESCRIPTOR = {
	kind: "core",
	id: SCIM_USER_SCHEMA,
	required: true,
	discoverySchema: SCIMUserResourceSchema,
} as const;

/**
 * Ordered built-in schema descriptors for the SCIM User resource.
 *
 * Validation, discovery, ResourceType metadata, OpenAPI, persistence, and
 * response serialization consume these descriptors.
 */
export const SCIM_USER_SCHEMA_DESCRIPTORS = [
	SCIM_CORE_USER_SCHEMA_DESCRIPTOR,
	SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR,
] as const;

const supportedUserSchemaIds: ReadonlySet<string> = new Set(
	SCIM_USER_SCHEMA_DESCRIPTORS.map((descriptor) => descriptor.id),
);

const scimUserSchemasSchema = z
	.array(z.string())
	.min(1)
	.max(SCIM_USER_SCHEMA_DESCRIPTORS.length)
	.superRefine((schemas, context) => {
		for (const schema of schemas) {
			if (!supportedUserSchemaIds.has(schema)) {
				context.addIssue({
					code: "custom",
					message: `Unsupported SCIM User schema ${schema}`,
				});
			}
			if (schemas.indexOf(schema) !== schemas.lastIndexOf(schema)) {
				context.addIssue({
					code: "custom",
					message: `SCIM User schema ${schema} must not be duplicated`,
				});
			}
		}
		for (const descriptor of SCIM_USER_SCHEMA_DESCRIPTORS) {
			if (descriptor.required && !schemas.includes(descriptor.id)) {
				context.addIssue({
					code: "custom",
					message: `schemas must contain ${descriptor.id}`,
				});
			}
		}
	})
	.transform((schemas) =>
		SCIM_USER_SCHEMA_DESCRIPTORS.filter((descriptor) =>
			schemas.includes(descriptor.id),
		).map((descriptor) => descriptor.id),
	);

function validateEnterpriseDeclaration(
	user: {
		schemas: readonly string[];
		enterprise?: unknown;
	},
	context: z.RefinementCtx,
): void {
	if (
		user.enterprise !== undefined &&
		!user.schemas.includes(SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.id)
	) {
		context.addIssue({
			code: "custom",
			path: ["schemas"],
			message: `The Enterprise User extension requires ${SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.id} in schemas`,
		});
	}
}

export const APIUserSchema = z
	.object({
		schemas: scimUserSchemasSchema,
		userName: z.string().trim().min(1).max(512),
		externalId: scimLongStringSchema.optional(),
		displayName: scimLongStringSchema.optional(),
		name: scimNameSchema.optional(),
		emails: z
			.array(scimEmailSchema)
			.max(SCIM_MAX_MULTI_VALUE_COUNT)
			.refine(primaryRefinement(), {
				message: "emails cannot contain multiple primary values",
			})
			.refine(
				(emails) =>
					new Set(emails.map(createSCIMEmailTupleKey)).size === emails.length,
				{ message: "emails cannot contain duplicate type and value pairs" },
			)
			.refine(hasUniqueSCIMDefinedTypes, {
				message: "emails cannot contain duplicate defined types",
			})
			.optional(),
		title: scimSingleValueScalar(scimLongStringSchema).optional(),
		userType: scimSingleValueScalar(scimStringSchema).optional(),
		preferredLanguage: scimSingleValueScalar(scimStringSchema).optional(),
		locale: scimSingleValueScalar(scimStringSchema).optional(),
		timezone: scimSingleValueScalar(scimStringSchema).optional(),
		phoneNumbers: z
			.array(scimPhoneNumberSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement(), {
				message: "phoneNumbers cannot contain multiple primary values",
			})
			.refine(hasUniqueSCIMDefinedTypes, {
				message: "phoneNumbers cannot contain duplicate defined types",
			})
			.optional(),
		addresses: z
			.array(scimAddressSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement(), {
				message: "addresses cannot contain multiple primary values",
			})
			.refine(hasUniqueSCIMDefinedTypes, {
				message: "addresses cannot contain duplicate defined types",
			})
			.optional(),
		roles: z
			.array(scimRoleSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement(), {
				message: "roles cannot contain multiple primary values",
			})
			.refine(hasUniqueSCIMDefinedTypes, {
				message: "roles cannot contain duplicate defined types",
			})
			.optional(),
		entitlements: z
			.array(scimEntitlementSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement(), {
				message: "entitlements cannot contain multiple primary values",
			})
			.refine(hasUniqueSCIMDefinedTypes, {
				message: "entitlements cannot contain duplicate defined types",
			})
			.optional(),
		active: z.boolean().optional(),
		[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.id]:
			SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.inputSchema.optional(),
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
		validateEnterpriseDeclaration(
			{
				schemas: user.schemas,
				enterprise: user[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.id],
			},
			context,
		);
		if (
			JSON.stringify(user).length > SCIM_MAX_SERIALIZED_USER_ATTRIBUTES_LENGTH
		) {
			context.addIssue({
				code: "custom",
				message: "SCIM User attributes exceed the supported serialized size",
			});
		}
	});

export type APIUser = z.infer<typeof APIUserSchema>;

export const SCIMCanonicalUserAttributesSchema = z
	.object({
		schemas: scimUserSchemasSchema,
		name: scimCanonicalNameSchema,
		emails: z
			.array(scimCanonicalEmailSchema)
			.min(1)
			.max(SCIM_MAX_MULTI_VALUE_COUNT)
			.refine(
				(emails) => emails.filter((email) => email.primary).length === 1,
				{ message: "stored emails must contain exactly one primary value" },
			)
			.refine(
				(emails) =>
					new Set(emails.map(createSCIMEmailTupleKey)).size === emails.length,
				{ message: "stored emails must contain unique type and value pairs" },
			)
			.refine(hasUniqueSCIMDefinedTypes, {
				message: "stored emails must contain unique defined types",
			}),
		title: scimLongStringSchema.optional(),
		userType: scimStringSchema.optional(),
		preferredLanguage: scimStringSchema.optional(),
		locale: scimStringSchema.optional(),
		timezone: scimStringSchema.optional(),
		phoneNumbers: z
			.array(scimPhoneNumberSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement())
			.refine(hasUniqueSCIMDefinedTypes)
			.optional(),
		addresses: z
			.array(scimAddressSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement())
			.refine(hasUniqueSCIMDefinedTypes)
			.optional(),
		roles: z
			.array(scimRoleSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement())
			.refine(hasUniqueSCIMDefinedTypes)
			.optional(),
		entitlements: z
			.array(scimEntitlementSchema)
			.max(SCIM_MAX_STRUCTURED_VALUE_COUNT)
			.refine(primaryRefinement())
			.refine(hasUniqueSCIMDefinedTypes)
			.optional(),
		[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.canonicalAttribute]:
			SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.canonicalSchema.optional(),
	})
	.superRefine(validateEnterpriseDeclaration);

export type SCIMCanonicalUserAttributes = z.infer<
	typeof SCIMCanonicalUserAttributesSchema
>;

const complexMultiValueOpenAPISchema = {
	type: "array",
	maxItems: SCIM_MAX_STRUCTURED_VALUE_COUNT,
};

const commonMultiValueProperties = {
	type: { type: "string", maxLength: 256 },
	primary: { type: "boolean" },
};

export const OpenAPIUserResourceSchema = {
	type: "object",
	properties: {
		id: { type: "string" },
		externalId: { type: "string", maxLength: 1_024 },
		meta: {
			type: "object",
			properties: {
				resourceType: { type: "string" },
				created: { type: "string", format: "date-time" },
				lastModified: { type: "string", format: "date-time" },
				location: { type: "string" },
			},
		},
		userName: { type: "string", maxLength: 512 },
		name: {
			type: "object",
			properties: {
				formatted: { type: "string", maxLength: 1_024 },
				givenName: { type: "string", maxLength: 256 },
				familyName: { type: "string", maxLength: 256 },
				middleName: { type: "string", maxLength: 256 },
				honorificPrefix: { type: "string", maxLength: 256 },
				honorificSuffix: { type: "string", maxLength: 256 },
			},
		},
		displayName: { type: "string", maxLength: 1_024 },
		title: { type: "string", maxLength: 1_024 },
		userType: { type: "string", maxLength: 256 },
		preferredLanguage: { type: "string", maxLength: 256 },
		locale: { type: "string", maxLength: 256 },
		timezone: { type: "string", maxLength: 256 },
		active: { type: "boolean" },
		emails: {
			type: "array",
			maxItems: SCIM_MAX_MULTI_VALUE_COUNT,
			items: {
				type: "object",
				properties: {
					value: { type: "string", format: "email", maxLength: 254 },
					...commonMultiValueProperties,
				},
			},
		},
		phoneNumbers: {
			...complexMultiValueOpenAPISchema,
			items: {
				type: "object",
				properties: {
					value: { type: "string", maxLength: 1_024 },
					...commonMultiValueProperties,
				},
			},
		},
		addresses: {
			...complexMultiValueOpenAPISchema,
			items: {
				type: "object",
				properties: {
					formatted: { type: "string", maxLength: 1_024 },
					streetAddress: { type: "string", maxLength: 1_024 },
					locality: { type: "string", maxLength: 256 },
					region: { type: "string", maxLength: 256 },
					postalCode: { type: "string", maxLength: 256 },
					country: { type: "string", maxLength: 256 },
					...commonMultiValueProperties,
				},
			},
		},
		roles: {
			...complexMultiValueOpenAPISchema,
			items: {
				type: "object",
				properties: {
					value: { type: "string", maxLength: 1_024 },
					display: { type: "string", maxLength: 1_024 },
					...commonMultiValueProperties,
				},
			},
		},
		entitlements: {
			...complexMultiValueOpenAPISchema,
			items: {
				type: "object",
				properties: {
					value: { type: "string", maxLength: 1_024 },
					display: { type: "string", maxLength: 1_024 },
					...commonMultiValueProperties,
				},
			},
		},
		[SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.responseAttribute]:
			SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR.openAPISchema,
		schemas: {
			type: "array",
			maxItems: SCIM_USER_SCHEMA_DESCRIPTORS.length,
			items: {
				type: "string",
				enum: SCIM_USER_SCHEMA_DESCRIPTORS.map((descriptor) => descriptor.id),
			},
		},
	},
	required: ["schemas", "id"] as string[],
} as const;

export const SCIMUserResourceType = {
	schemas: [SCIM_RESOURCE_TYPE_SCHEMA],
	id: "User",
	name: "User",
	endpoint: "/Users",
	description: "User Account",
	schema: SCIM_CORE_USER_SCHEMA_DESCRIPTOR.id,
	schemaExtensions: SCIM_USER_SCHEMA_DESCRIPTORS.filter(
		(descriptor) => !descriptor.required,
	).map((descriptor) => ({
		schema: descriptor.id,
		required: descriptor.required,
	})),
	meta: {
		resourceType: "ResourceType",
		location: "/scim/v2/ResourceTypes/User",
	},
};
