import { openAPI } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
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
		const { auth } = await getTestInstance({
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
								"application/scim+json": expect.any(Object),
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
		).toEqual(["userName", "displayName", "active", "name", "emails"]);
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
		).toBe(true);
		expect(
			APIUserSchema.parse({
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ADA@EXAMPLE.COM",
				name: {
					formatted: "Ada Lovelace",
					givenName: "not persisted",
				},
			}),
		).toEqual({
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
			userName: "ADA@EXAMPLE.COM",
			name: { formatted: "Ada Lovelace", givenName: "not persisted" },
		});
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

	it("marks every field emitted by resource responses as required", () => {
		expect(OpenAPIUserResourceSchema.required).toEqual(
			expect.arrayContaining([
				"schemas",
				"id",
				"userName",
				"name",
				"displayName",
				"active",
				"emails",
				"meta",
			]),
		);
		expect(OpenAPIUserResourceSchema.properties).toHaveProperty("externalId");
		expect(OpenAPIUserResourceSchema.properties.name.required).toEqual([
			"formatted",
		]);
		expect(OpenAPIUserResourceSchema.properties.emails.items.required).toEqual([
			"value",
			"primary",
		]);
		expect(OpenAPIUserResourceSchema.properties.meta.required).toEqual([
			"resourceType",
			"created",
			"lastModified",
			"location",
		]);

		expect(OpenAPIGroupResourceSchema.required).toEqual(
			expect.arrayContaining([
				"schemas",
				"id",
				"displayName",
				"members",
				"meta",
			]),
		);
		expect(
			OpenAPIGroupResourceSchema.properties.members.items.required,
		).toEqual(["value", "$ref", "display", "type"]);
		expect(OpenAPIGroupResourceSchema.properties.meta.required).toEqual([
			"resourceType",
			"created",
			"lastModified",
			"location",
		]);
	});
});
