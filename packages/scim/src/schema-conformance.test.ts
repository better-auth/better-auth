import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { openAPI } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import {
	APIGroupSchema,
	OpenAPIGroupResourceSchema,
	SCIMGroupResourceSchema,
} from "./group-schemas";
import { SCIM_RESOURCE_SCHEMA_REGISTRY } from "./resource-schema-registry";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIM_ENTERPRISE_USER_SCHEMA,
	SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR,
	SCIMCanonicalUserAttributesSchema,
	SCIMEnterpriseUserInputSchema,
	SCIMEnterpriseUserResourceSchema,
	SCIMUserResourceSchema,
} from "./user-schemas";

interface SchemaAttribute {
	name: string;
	subAttributes?: readonly SchemaAttribute[];
}

function getAttribute(
	attributes: readonly SchemaAttribute[],
	name: string,
): SchemaAttribute {
	const attribute = attributes.find((candidate) => candidate.name === name);
	if (!attribute) throw new Error(`Expected ${name} attribute`);
	return attribute;
}

function getSubAttribute(attribute: SchemaAttribute, name: string) {
	if (!attribute.subAttributes) {
		throw new Error(`Expected ${attribute.name} to have sub-attributes`);
	}
	return getAttribute(attribute.subAttributes, name);
}

describe("SCIM core schema conformance", () => {
	it("uses one registry for validation, discovery, and query capabilities", () => {
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.User).toMatchObject({
			type: "User",
			schemaId: "urn:ietf:params:scim:schemas:core:2.0:User",
			schemas: [
				{
					id: "urn:ietf:params:scim:schemas:core:2.0:User",
					required: true,
				},
				{
					id: SCIM_ENTERPRISE_USER_SCHEMA,
					required: false,
					canonicalAttribute: "enterprise",
				},
			],
			filterAttributes: [
				"id",
				"userName",
				"externalId",
				"emails.value",
				"emails.work.value",
			],
		});
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.User.inputSchema).toBe(APIUserSchema);
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.User.discoverySchema).toBe(
			SCIMUserResourceSchema,
		);
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.User.schemas[1]?.discoverySchema).toBe(
			SCIMEnterpriseUserResourceSchema,
		);
		const enterpriseDescriptor = SCIM_RESOURCE_SCHEMA_REGISTRY.User.schemas[1];
		expect(enterpriseDescriptor).toBe(SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR);
		expect(enterpriseDescriptor?.inputSchema).toBe(
			SCIMEnterpriseUserInputSchema,
		);
		expect(enterpriseDescriptor?.responseAttribute).toBe(
			SCIM_ENTERPRISE_USER_SCHEMA,
		);
		expect(enterpriseDescriptor?.openAPISchema).toBe(
			OpenAPIUserResourceSchema.properties[SCIM_ENTERPRISE_USER_SCHEMA],
		);
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.Group).toMatchObject({
			type: "Group",
			schemaId: "urn:ietf:params:scim:schemas:core:2.0:Group",
			filterAttributes: ["id", "displayName", "externalId"],
		});
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.Group.inputSchema).toBe(
			APIGroupSchema,
		);
		expect(SCIM_RESOURCE_SCHEMA_REGISTRY.Group.discoverySchema).toBe(
			SCIMGroupResourceSchema,
		);
	});

	it("advertises the SCIM response media type through OpenAPI", async () => {
		const auth = betterAuth({
			database: memoryAdapter({
				user: [],
				session: [],
				verification: [],
				account: [],
				scimConnectionBinding: [],
				scimIdentityTombstone: [],
				scimSubject: [],
				scimUser: [],
				scimGroup: [],
				scimGroupMember: [],
				scimProjectionGrant: [],
			}),
			plugins: [
				scim({
					connections: [
						{
							id: "open-api",
							credentials: [
								{
									type: "bearer",
									id: "open-api-token",
									token: "open-api-token",
								},
							],
						},
					],
				}),
				openAPI(),
			],
		});

		const openAPISchema = await auth.api.generateOpenAPISchema();
		expect(openAPISchema.paths).toMatchObject({
			"/scim/v2/Users": {
				post: {
					responses: {
						"201": {
							content: {
								"application/scim+json": {
									schema: {
										properties: {
											title: { type: "string" },
											phoneNumbers: {
												type: "array",
												maxItems: 10,
											},
											[SCIM_ENTERPRISE_USER_SCHEMA]: {
												type: "object",
												properties: {
													manager: { type: "object" },
												},
											},
											schemas: {
												items: {
													enum: [
														"urn:ietf:params:scim:schemas:core:2.0:User",
														SCIM_ENTERPRISE_USER_SCHEMA,
													],
												},
											},
										},
									},
								},
							},
						},
						"400": {
							content: {
								"application/scim+json": expect.any(Object),
							},
						},
					},
				},
			},
		});
	});

	it("advertises only the persisted User profile", () => {
		expect(
			SCIMUserResourceSchema.attributes.map((attribute) => attribute.name),
		).toEqual([
			"userName",
			"displayName",
			"active",
			"name",
			"emails",
			"title",
			"userType",
			"preferredLanguage",
			"locale",
			"timezone",
			"phoneNumbers",
			"addresses",
			"roles",
			"entitlements",
		]);
		expect(SCIMUserResourceSchema.attributes).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "id" }),
				expect.objectContaining({ name: "externalId" }),
			]),
		);

		const userName = getAttribute(
			SCIMUserResourceSchema.attributes,
			"userName",
		);
		expect(userName).toMatchObject({
			required: true,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "server",
		});

		const displayName = getAttribute(
			SCIMUserResourceSchema.attributes,
			"displayName",
		);
		expect(displayName).toMatchObject({
			required: false,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		});

		const name = getAttribute(SCIMUserResourceSchema.attributes, "name");
		expect(name).toMatchObject({
			required: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		});
		expect(name.subAttributes?.map((attribute) => attribute.name)).toEqual([
			"formatted",
			"givenName",
			"familyName",
			"middleName",
			"honorificPrefix",
			"honorificSuffix",
		]);
		expect(getSubAttribute(name, "formatted")).toMatchObject({
			required: false,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		});

		const emails = getAttribute(SCIMUserResourceSchema.attributes, "emails");
		expect(emails).toMatchObject({
			required: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		});
		expect(emails.subAttributes?.map((attribute) => attribute.name)).toEqual([
			"value",
			"type",
			"primary",
		]);
		expect(getSubAttribute(emails, "value")).toMatchObject({
			required: true,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		});
		expect(getSubAttribute(emails, "primary")).toMatchObject({
			required: false,
			mutability: "readWrite",
			returned: "default",
		});

		for (const attributeName of [
			"title",
			"userType",
			"preferredLanguage",
			"locale",
			"timezone",
		]) {
			expect(
				getAttribute(SCIMUserResourceSchema.attributes, attributeName),
			).toMatchObject({
				required: false,
				mutability: "readWrite",
				returned: "default",
			});
		}
		for (const attributeName of [
			"phoneNumbers",
			"addresses",
			"roles",
			"entitlements",
		]) {
			expect(
				getAttribute(SCIMUserResourceSchema.attributes, attributeName),
			).toMatchObject({
				multiValued: true,
				required: false,
				mutability: "readWrite",
				returned: "default",
			});
		}

		expect(APIUserSchema.safeParse({ userName: "" }).success).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "directory-user-without-email",
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "directory-user",
				emails: [{ value: `${"a".repeat(255)}@example.com`, primary: true }],
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
				emails: [
					{ value: "first@example.com", type: "work" },
					{ value: "second@example.com", type: "WORK" },
				],
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.parse({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ADA@EXAMPLE.COM",
				name: {
					formatted: "Ada Lovelace",
					givenName: "Ada",
				},
			}),
		).toEqual({
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			userName: "ADA@EXAMPLE.COM",
			name: { formatted: "Ada Lovelace", givenName: "Ada" },
		});
	});

	it("validates and advertises the built-in Enterprise User extension", () => {
		expect(
			SCIMEnterpriseUserResourceSchema.attributes.map(
				(attribute) => attribute.name,
			),
		).toEqual([
			"employeeNumber",
			"costCenter",
			"organization",
			"division",
			"department",
			"manager",
		]);
		for (const attributeName of [
			"employeeNumber",
			"costCenter",
			"organization",
			"division",
			"department",
		]) {
			expect(
				getAttribute(
					SCIMEnterpriseUserResourceSchema.attributes,
					attributeName,
				),
			).toMatchObject({
				required: false,
				mutability: "readWrite",
				returned: "default",
			});
		}
		const manager = getAttribute(
			SCIMEnterpriseUserResourceSchema.attributes,
			"manager",
		);
		expect(manager).toMatchObject({
			type: "complex",
			multiValued: false,
			mutability: "readWrite",
			returned: "default",
		});
		expect(getSubAttribute(manager, "value")).toMatchObject({
			required: false,
			mutability: "readWrite",
			returned: "default",
		});
		expect(getSubAttribute(manager, "$ref")).toMatchObject({
			referenceTypes: ["User"],
			mutability: "readWrite",
			returned: "default",
		});
		expect(getSubAttribute(manager, "displayName")).toMatchObject({
			mutability: "readOnly",
			returned: "default",
		});

		expect(
			APIUserSchema.parse({
				schemas: [SCIM_ENTERPRISE_USER_SCHEMA, SCIMUserResourceSchema.id],
				userName: "entra-declared@example.com",
			}),
		).toEqual({
			schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
			userName: "entra-declared@example.com",
		});
		expect(
			APIUserSchema.parse({
				schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
				userName: "entra-manager@example.com",
				[SCIM_ENTERPRISE_USER_SCHEMA]: {
					employeeNumber: " 42 ",
					manager: " manager-1 ",
				},
			}),
		).toMatchObject({
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				employeeNumber: "42",
				manager: { value: "manager-1" },
			},
		});
		expect(
			APIUserSchema.parse({
				schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
				userName: "rfc-manager@example.com",
				[SCIM_ENTERPRISE_USER_SCHEMA]: {
					manager: {
						value: "external-manager",
						$ref: "https://directory.example/Users/external-manager",
						displayName: "External Manager",
					},
				},
				password: "not accepted",
				ims: [{ value: "not accepted" }],
				photos: [{ value: "not accepted" }],
				x509Certificates: [{ value: "not accepted" }],
			}),
		).toEqual({
			schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
			userName: "rfc-manager@example.com",
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				manager: {
					value: "external-manager",
					$ref: "https://directory.example/Users/external-manager",
				},
			},
		});
		expect(
			APIUserSchema.parse({
				schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
				userName: "entra-manager-array@example.com",
				[SCIM_ENTERPRISE_USER_SCHEMA]: {
					manager: [
						{
							value: "manager-2",
							$ref: "/scim/v2/Users/manager-2",
							displayName: "Manager Two",
						},
					],
				},
			}),
		).toMatchObject({
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				manager: {
					value: "manager-2",
					$ref: "/scim/v2/Users/manager-2",
				},
			},
		});
		expect(
			APIUserSchema.parse({
				schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
				userName: "reference-only-manager@example.com",
				[SCIM_ENTERPRISE_USER_SCHEMA]: {
					manager: {
						$ref: "/scim/v2/Users/manager-3",
						displayName: "Ignored client display value",
					},
				},
			}),
		).toMatchObject({
			[SCIM_ENTERPRISE_USER_SCHEMA]: {
				manager: { $ref: "/scim/v2/Users/manager-3" },
			},
		});
		expect(
			APIUserSchema.parse({
				schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
				userName: "display-only-manager@example.com",
				[SCIM_ENTERPRISE_USER_SCHEMA]: {
					manager: { displayName: "Ignored client display value" },
				},
			}),
		).toEqual({
			schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
			userName: "display-only-manager@example.com",
			[SCIM_ENTERPRISE_USER_SCHEMA]: {},
		});
		const undeclaredEnterpriseSchema = APIUserSchema.safeParse({
			schemas: [SCIMUserResourceSchema.id],
			userName: "undeclared@example.com",
			[SCIM_ENTERPRISE_USER_SCHEMA]: { employeeNumber: "42" },
		});
		expect(undeclaredEnterpriseSchema.success).toBe(false);
		if (!undeclaredEnterpriseSchema.success) {
			expect(undeclaredEnterpriseSchema.error.issues[0]).toMatchObject({
				path: ["schemas"],
				message: expect.stringContaining(SCIM_ENTERPRISE_USER_SCHEMA),
			});
		}
		expect(
			APIUserSchema.safeParse({
				schemas: [
					SCIMUserResourceSchema.id,
					"urn:example:params:scim:schemas:extension:2.0:User",
				],
				userName: "unknown@example.com",
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: [SCIMUserResourceSchema.id, SCIM_ENTERPRISE_USER_SCHEMA],
				userName: "invalid-manager@example.com",
				[SCIM_ENTERPRISE_USER_SCHEMA]: { manager: [] },
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: [SCIMUserResourceSchema.id],
				userName: "invalid-boolean@example.com",
				phoneNumbers: [{ value: "+1-555-0100", primary: "true" }],
			}).success,
		).toBe(false);
	});

	it("requires unique case-insensitive defined types on User multi-valued attributes", () => {
		const duplicateTypeCases = [
			{
				attribute: "emails",
				values: [
					{ value: "first@example.com", type: "Work", primary: true },
					{ value: "second@example.com", type: "work" },
				],
			},
			{
				attribute: "phoneNumbers",
				values: [
					{ value: "+1-555-0100", type: "Work" },
					{ value: "+1-555-0101", type: "work" },
				],
			},
			{
				attribute: "addresses",
				values: [
					{ formatted: "First office", type: "Work" },
					{ formatted: "Second office", type: "work" },
				],
			},
			{
				attribute: "roles",
				values: [
					{ value: "first-role", type: "Work" },
					{ value: "second-role", type: "work" },
				],
			},
			{
				attribute: "entitlements",
				values: [
					{ value: "first-entitlement", type: "Work" },
					{ value: "second-entitlement", type: "work" },
				],
			},
		] as const;

		for (const { attribute, values } of duplicateTypeCases) {
			expect(
				APIUserSchema.safeParse({
					schemas: [SCIMUserResourceSchema.id],
					userName: `${attribute}@example.com`,
					[attribute]: values,
				}).success,
				attribute,
			).toBe(false);
			expect(
				SCIMCanonicalUserAttributesSchema.safeParse({
					schemas: [SCIMUserResourceSchema.id],
					name: { formatted: "Typed User" },
					emails:
						attribute === "emails"
							? values
							: [{ value: "typed@example.com", primary: true }],
					...(attribute === "emails" ? {} : { [attribute]: values }),
				}).success,
				`${attribute} canonical`,
			).toBe(false);
		}

		expect(
			APIUserSchema.safeParse({
				schemas: [SCIMUserResourceSchema.id],
				userName: "untyped@example.com",
				emails: [
					{ value: "first@example.com", primary: true },
					{ value: "second@example.com" },
				],
				phoneNumbers: [{ value: "+1-555-0100" }, { value: "+1-555-0101" }],
				addresses: [
					{ formatted: "First office" },
					{ formatted: "Second office" },
				],
				roles: [{ value: "first-role" }, { value: "second-role" }],
				entitlements: [
					{ value: "first-entitlement" },
					{ value: "second-entitlement" },
				],
			}).success,
		).toBe(true);
	});

	it("rejects an address whose only content is its type or primary flag", () => {
		expect(
			APIUserSchema.safeParse({
				schemas: [SCIMUserResourceSchema.id],
				userName: "typeless-address@example.com",
				addresses: [{ type: "work" }],
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: [SCIMUserResourceSchema.id],
				userName: "primary-only-address@example.com",
				addresses: [{ type: "work", primary: true }],
			}).success,
		).toBe(false);
		expect(
			APIUserSchema.safeParse({
				schemas: [SCIMUserResourceSchema.id],
				userName: "content-address@example.com",
				addresses: [{ type: "work", locality: "Cambridge" }],
			}).success,
		).toBe(true);
	});

	it("advertises canonical User-only Group memberships", () => {
		expect(
			SCIMGroupResourceSchema.attributes.map((attribute) => attribute.name),
		).toEqual(["displayName", "members"]);

		const displayName = getAttribute(
			SCIMGroupResourceSchema.attributes,
			"displayName",
		);
		expect(displayName).toMatchObject({
			required: true,
			caseExact: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "server",
		});

		const members = getAttribute(SCIMGroupResourceSchema.attributes, "members");
		expect(members).toMatchObject({
			required: false,
			mutability: "readWrite",
			returned: "default",
			uniqueness: "none",
		});
		expect(members.subAttributes?.map((attribute) => attribute.name)).toEqual([
			"value",
			"$ref",
			"display",
			"type",
		]);
		expect(getSubAttribute(members, "value")).toMatchObject({
			required: true,
			caseExact: false,
			mutability: "immutable",
			returned: "default",
			uniqueness: "none",
		});
		expect(getSubAttribute(members, "$ref")).toMatchObject({
			referenceTypes: ["User"],
			mutability: "immutable",
			returned: "default",
		});
		expect(getSubAttribute(members, "display")).toMatchObject({
			mutability: "readOnly",
			returned: "default",
		});
		expect(getSubAttribute(members, "type")).toMatchObject({
			canonicalValues: ["User"],
			mutability: "immutable",
			returned: "default",
		});

		expect(
			APIGroupSchema.safeParse({
				displayName: "Engineering",
				members: [{}],
			}).success,
		).toBe(false);
		expect(
			APIGroupSchema.parse({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				displayName: "Engineering",
				members: [
					{
						value: "scim-user-id",
						$ref: "https://example.com/scim/v2/Users/scim-user-id",
						display: "not persisted",
						type: "User",
					},
				],
			}),
		).toEqual({
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
			displayName: "Engineering",
			members: [{ value: "scim-user-id", type: "User" }],
		});
	});

	it("requires only fields that survive every response projection", () => {
		expect(OpenAPIUserResourceSchema.required).toEqual(["schemas", "id"]);
		expect(OpenAPIUserResourceSchema.properties).toHaveProperty("externalId");
		expect(OpenAPIUserResourceSchema.properties).toHaveProperty("title");
		expect(OpenAPIUserResourceSchema.properties).toHaveProperty("phoneNumbers");
		expect(OpenAPIUserResourceSchema.properties).toHaveProperty(
			SCIM_ENTERPRISE_USER_SCHEMA,
		);
		expect(
			OpenAPIUserResourceSchema.properties[SCIM_ENTERPRISE_USER_SCHEMA]
				.properties.manager.properties,
		).not.toHaveProperty("displayName");
		expect(OpenAPIUserResourceSchema.properties.schemas.items.enum).toEqual([
			SCIMUserResourceSchema.id,
			SCIM_ENTERPRISE_USER_SCHEMA,
		]);
		expect(OpenAPIUserResourceSchema.properties.name).not.toHaveProperty(
			"required",
		);
		expect(
			OpenAPIUserResourceSchema.properties.emails.items,
		).not.toHaveProperty("required");
		expect(OpenAPIUserResourceSchema.properties.meta).not.toHaveProperty(
			"required",
		);

		expect(OpenAPIGroupResourceSchema.required).toEqual(["schemas", "id"]);
		expect(
			OpenAPIGroupResourceSchema.properties.members.items,
		).not.toHaveProperty("required");
		expect(OpenAPIGroupResourceSchema.properties.meta).not.toHaveProperty(
			"required",
		);
	});
});
