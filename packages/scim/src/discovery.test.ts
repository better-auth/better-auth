import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import {
	getSCIMResourceType,
	getSCIMResourceTypes,
	getSCIMSchema,
	getSCIMSchemas,
	getSCIMServiceProviderConfig,
} from "./discovery";

function createDiscoveryTestAuth() {
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
					getSCIMSchemas,
					getSCIMSchema,
					getSCIMResourceTypes,
					getSCIMResourceType,
				},
			} satisfies BetterAuthPlugin,
		],
	});
}

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
			totalResults: 2,
			startIndex: 1,
			itemsPerPage: 2,
		});
		expect(schemas.Resources.map((schema) => schema.id)).toEqual([
			"urn:ietf:params:scim:schemas:core:2.0:User",
			"urn:ietf:params:scim:schemas:core:2.0:Group",
		]);
		expect(resourceTypes).toMatchObject({
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			totalResults: 2,
			startIndex: 1,
			itemsPerPage: 2,
		});
		expect(
			resourceTypes.Resources.map(({ id, endpoint, schema }) => ({
				id,
				endpoint,
				schema,
			})),
		).toEqual([
			{
				id: "User",
				endpoint: "/Users",
				schema: "urn:ietf:params:scim:schemas:core:2.0:User",
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
});
