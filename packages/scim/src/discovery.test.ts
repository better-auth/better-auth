import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import type { SCIMUserSchemaExtension } from "./configuration";
import {
	createGetSCIMResourceType,
	createGetSCIMResourceTypes,
	createGetSCIMSchema,
	createGetSCIMSchemas,
	getSCIMServiceProviderConfig,
} from "./discovery";
import { buildSCIMUserSchemaContext } from "./user-schema-context";

function createDiscoveryTestAuth(
	userSchemaExtensions?: readonly SCIMUserSchemaExtension[],
) {
	const context = buildSCIMUserSchemaContext({
		connections: [],
		...(userSchemaExtensions ? { userSchemaExtensions } : {}),
	});
	return betterAuth({
		baseURL: "http://localhost:3000",
		database: memoryAdapter({
			user: [],
			session: [],
			account: [],
			verification: [],
		}),
		plugins: [
			{
				id: "scim-discovery-test",
				endpoints: {
					getSCIMServiceProviderConfig,
					getSCIMSchemas: createGetSCIMSchemas(context.discoverySchemas),
					getSCIMSchema: createGetSCIMSchema(context.discoverySchemas),
					getSCIMResourceTypes: createGetSCIMResourceTypes(
						context.resourceTypes,
					),
					getSCIMResourceType: createGetSCIMResourceType(context.resourceTypes),
				},
			} satisfies BetterAuthPlugin,
		],
	});
}

const ACME_USER_EXTENSION: SCIMUserSchemaExtension = {
	urn: "urn:ietf:params:scim:schemas:extension:acme:2.0:User",
	name: "AcmeUser",
	description: "Acme-specific User attributes",
	attributes: [
		{ name: "sapUserId", type: "string", mapTo: "sapUserId" },
		{ name: "costCenter", type: "string" },
	],
};

describe("SCIM discovery", () => {
	it("describes supported protocol capabilities without an organization dependency", async () => {
		const auth = createDiscoveryTestAuth();

		const config = await auth.api.getSCIMServiceProviderConfig();

		expect(config).toMatchObject({
			patch: { supported: true },
			bulk: {
				supported: false,
				maxOperations: 0,
				maxPayloadSize: 0,
			},
			filter: { supported: true, maxResults: 100 },
			authenticationSchemes: [
				expect.objectContaining({
					type: "oauthbearertoken",
					primary: true,
				}),
			],
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
			meta: {
				resourceType: "ServiceProviderConfig",
				location:
					"http://localhost:3000/api/auth/scim/v2/ServiceProviderConfig",
			},
		});
		expect(JSON.stringify(config)).not.toContain("organization");
	});

	it("returns supported schemas and resource types as SCIM ListResponses", async () => {
		const auth = createDiscoveryTestAuth();

		const [schemas, resourceTypes] = await Promise.all([
			auth.api.getSCIMSchemas(),
			auth.api.getSCIMResourceTypes(),
		]);

		expect(schemas).toMatchObject({
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			totalResults: 3,
			startIndex: 1,
			itemsPerPage: 3,
		});
		expect(schemas.Resources.map((schema) => schema.id)).toEqual([
			"urn:ietf:params:scim:schemas:core:2.0:User",
			"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
			"urn:ietf:params:scim:schemas:core:2.0:Group",
		]);
		expect(resourceTypes).toMatchObject({
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			totalResults: 2,
			startIndex: 1,
			itemsPerPage: 2,
		});
		expect(
			resourceTypes.Resources.map((resourceType: Record<string, unknown>) => ({
				id: resourceType.id,
				endpoint: resourceType.endpoint,
				schema: resourceType.schema,
				...("schemaExtensions" in resourceType
					? { schemaExtensions: resourceType.schemaExtensions }
					: {}),
			})),
		).toEqual([
			{
				id: "User",
				endpoint: "/Users",
				schema: "urn:ietf:params:scim:schemas:core:2.0:User",
				schemaExtensions: [
					{
						schema:
							"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
						required: false,
					},
				],
			},
			{
				id: "Group",
				endpoint: "/Groups",
				schema: "urn:ietf:params:scim:schemas:core:2.0:Group",
			},
		]);
	});

	it("returns SCIM errors for unknown schema and resource type identifiers", async () => {
		const auth = createDiscoveryTestAuth();

		await expect(
			auth.api.getSCIMSchema({ params: { schemaId: "unknown" } }),
		).rejects.toMatchObject({
			body: {
				detail: "Schema not found",
				schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
				status: "404",
			},
		});
		await expect(
			auth.api.getSCIMResourceType({
				params: { resourceTypeId: "unknown" },
			}),
		).rejects.toMatchObject({
			body: {
				detail: "Resource type not found",
				schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
				status: "404",
			},
		});
	});

	it("advertises a declared custom User schema extension in /Schemas", async () => {
		const auth = createDiscoveryTestAuth([ACME_USER_EXTENSION]);

		const schemas = await auth.api.getSCIMSchemas();

		expect(schemas.Resources.map((schema) => schema.id)).toEqual([
			"urn:ietf:params:scim:schemas:core:2.0:User",
			"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
			"urn:ietf:params:scim:schemas:core:2.0:Group",
			"urn:ietf:params:scim:schemas:extension:acme:2.0:User",
		]);

		const acme = await auth.api.getSCIMSchema({
			params: {
				schemaId: "urn:ietf:params:scim:schemas:extension:acme:2.0:User",
			},
		});
		expect(acme).toMatchObject({
			id: "urn:ietf:params:scim:schemas:extension:acme:2.0:User",
			name: "AcmeUser",
			attributes: [
				expect.objectContaining({ name: "sapUserId", type: "string" }),
				expect.objectContaining({ name: "costCenter", type: "string" }),
			],
		});
	});

	it("advertises the custom extension as a User schemaExtension", async () => {
		const auth = createDiscoveryTestAuth([ACME_USER_EXTENSION]);

		const user = await auth.api.getSCIMResourceType({
			params: { resourceTypeId: "User" },
		});

		expect(user).toMatchObject({
			id: "User",
			schemaExtensions: [
				{
					schema: "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
					required: false,
				},
				{
					schema: "urn:ietf:params:scim:schemas:extension:acme:2.0:User",
					required: false,
				},
			],
		});
	});
});
